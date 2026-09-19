@echo off
title Aaj Cash & Carry POS - Emergency Admin Reset
color 0E
echo =====================================================================
echo           AAJ CASH & CARRY POS - EMERGENCY ADMIN PASSWORD RESET
echo =====================================================================
echo.
echo WARNING: This tool will reset the Admin login credentials to:
echo          Username: admin
echo          Password: 1234
echo.
echo Your sales, products, categories, and customer khata records will NOT be touched.
echo.
set /p confirm="Do you want to reset the admin password now? (Y/N): "
if /I not "%confirm%"=="Y" (
    echo Reset cancelled.
    pause
    exit /b
)
echo.
echo Resetting admin credentials...
call npx electron ./scripts/emergency-reset-admin.js
echo.
pause
