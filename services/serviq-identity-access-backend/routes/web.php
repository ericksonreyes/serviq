<?php

use App\Http\Controllers\JwksController;
use Illuminate\Support\Facades\Route;

Route::get('/.well-known/jwks.json', JwksController::class);
