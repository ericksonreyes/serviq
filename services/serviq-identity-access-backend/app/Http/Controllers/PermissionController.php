<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use Illuminate\Http\JsonResponse;

class PermissionController
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Permission::orderBy('name')->get()]);
    }
}
