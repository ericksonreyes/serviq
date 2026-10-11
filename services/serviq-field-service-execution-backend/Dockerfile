# ServIQ Identity & Access — Laravel on php:apache (mod_php, ADR-0009).
# Multi-stage: composer installs vendor in a builder; the runtime image
# carries no composer, no node, no dev packages.

FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
# ext-sockets is required by php-amqplib at runtime (installed below), not
# needed just to resolve dependencies.
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts \
    --ignore-platform-req=ext-sockets
COPY . .
RUN composer dump-autoload --optimize --no-dev

FROM php:8.4-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev unzip curl \
    && docker-php-ext-install pdo_pgsql sockets \
    && (pecl install redis || true) \
    && docker-php-ext-enable redis \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod rewrite

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
    /etc/apache2/sites-available/000-default.conf \
    /etc/apache2/apache2.conf \
    /etc/apache2/conf-available/docker-php.conf

WORKDIR /var/www/html
RUN rm -rf /var/www/html
COPY --from=vendor /app /var/www/html

COPY docker/entrypoint.sh /usr/local/bin/serviq-entrypoint
RUN chmod +x /usr/local/bin/serviq-entrypoint \
    && mkdir -p storage/keys \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 80

ENTRYPOINT ["serviq-entrypoint"]
CMD ["apache2-foreground"]
