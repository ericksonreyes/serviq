"""Event consumer — watches evidence captures, parses the image out of
MinIO, emits AI.PaymentProofParsed for Billing to validate. Async flow
runs under service identity with on_behalf_of — never a live JWT.
"""
import json
import os
import sys
import urllib.request

import boto3
import pika

from .parser import parse_document

EXCHANGE = "serviq.events"
QUEUE = "ai-agent.events"
BINDINGS = ["Execution.EvidenceCaptured"]

RABBIT_HOST = os.environ.get("RABBITMQ_HOST", "rabbitmq")
RABBIT_USER = os.environ.get("RABBITMQ_USER", "serviq")
RABBIT_PASS = os.environ.get("RABBITMQ_PASS", "serviq")
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://minio:9000")
MINIO_USER = os.environ.get("MINIO_ROOT_USER", "serviq")
MINIO_PASS = os.environ.get("MINIO_ROOT_PASSWORD", "serviq-local")
OUTBOX_WEBHOOK = os.environ.get("AI_OUTBOX_URL")  # optional relay URL

_dlq_ready = False


def _s3():
    return boto3.client(
        "s3", endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_USER, aws_secret_access_key=MINIO_PASS,
        region_name="us-east-1",
    )


def _fetch_object(object_ref: str) -> bytes:
    bucket, _, key = object_ref.partition("/")
    return _s3().get_object(Bucket=bucket, Key=key)["Body"].read()


def _emit(event_type: str, payload: dict, tenant_id: str | None):
    """Publish directly to the exchange — this service has no database,
    so it uses the same envelope shape but publishes inline (documented
    exception: no outbox without a DB)."""
    creds = pika.PlainCredentials(RABBIT_USER, RABBIT_PASS)
    conn = pika.BlockingConnection(pika.ConnectionParameters(RABBIT_HOST, credentials=creds))
    ch = conn.channel()
    envelope = {
        "id": payload.get("parse_id") or os.urandom(16).hex(),
        "type": event_type,
        "payload": payload,
        "occurred_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(),
        "tenant_id": tenant_id,
        "actor_service": "ai-agent",
        "on_behalf_of": payload.get("on_behalf_of"),
    }
    ch.basic_publish(EXCHANGE, routing_key=event_type, body=json.dumps(envelope))
    conn.close()


def _handle(envelope: dict) -> None:
    p = envelope.get("payload") or {}
    object_ref = p.get("object_ref")
    if p.get("kind") != "photo" or not object_ref:
        return
    image = _fetch_object(object_ref)
    parsed = parse_document(image)
    _emit("AI.PaymentProofParsed", {
        "job_id": p.get("job_id"),
        "evidence_id": p.get("evidence_id"),
        "object_ref": object_ref,
        **parsed,
    }, envelope.get("tenant_id"))
    print(f"[ai-agent] parsed {object_ref} → {parsed['document_type']} "
          f"({parsed['confidence']})", flush=True)


def _declare_queues(conn, ch):
    """Queue + DLQ per EVENT_DELIVERY.MD: a failed handler NACKs into
    `ai-agent.events.dlq` via `serviq.events.dlx` instead of dropping."""
    dlq = QUEUE + ".dlq"
    dlx = EXCHANGE + ".dlx"
    ch.exchange_declare(dlx, exchange_type="direct", durable=True)
    ch.queue_declare(dlq, durable=True)
    ch.queue_bind(dlq, dlx, routing_key=dlq)
    args = {"x-dead-letter-exchange": dlx, "x-dead-letter-routing-key": dlq}
    try:
        ch.queue_declare(QUEUE, durable=True, arguments=args)
    except pika.exceptions.ChannelClosedByBroker as e:
        if e.reply_code != 406:
            raise
        # Queue predates dead-lettering (declared without args). Recreate it
        # only when empty — if_empty makes the broker refuse otherwise.
        ch = conn.channel()
        ch.queue_delete(QUEUE, if_empty=True)
        ch.queue_declare(QUEUE, durable=True, arguments=args)
        print(f"[ai-agent] redeclared {QUEUE} with dead-lettering", flush=True)
    return ch


def main() -> int:
    creds = pika.PlainCredentials(RABBIT_USER, RABBIT_PASS)
    conn = pika.BlockingConnection(pika.ConnectionParameters(RABBIT_HOST, credentials=creds))
    ch = conn.channel()
    ch.exchange_declare(EXCHANGE, exchange_type="topic", durable=True)
    ch = _declare_queues(conn, ch)
    for key in BINDINGS:
        ch.queue_bind(QUEUE, EXCHANGE, routing_key=key)

    def on_message(ch, method, props, body):
        try:
            _handle(json.loads(body))
            ch.basic_ack(method.delivery_tag)
        except Exception as e:  # noqa: BLE001 — bounded retry via DLQ policy
            print(f"[ai-agent] error: {e}", flush=True)
            ch.basic_nack(method.delivery_tag, requeue=False)

    ch.basic_consume(QUEUE, on_message_callback=on_message)
    print(f"[ai-agent] consuming {QUEUE}", flush=True)
    ch.start_consuming()
    return 0


if __name__ == "__main__":
    sys.exit(main())
