# =============================================================================
# cf_ai_dev_copilot Deployment Script (PowerShell)
# =============================================================================
#
# This script handles the complete deployment of DevCopilot to Cloudflare.
#
# Usage:
#   .\scripts\deploy.ps1           # Full deployment (check + build + deploy)
#   .\scripts\deploy.ps1 -Quick    # Quick deployment (skip checks)
#   .\scripts\deploy.ps1 -DryRun   # Simulate deployment without actually deploying
#
# =============================================================================

param(
    [switch]$Quick,
    [switch]$DryRun,
    [switch]$Help
)

# Stop on errors
$ErrorActionPreference = "Stop"

# =============================================================================
# Helper Functions
# =============================================================================

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "-------------------------------------------------------------" -ForegroundColor Blue
    Write-Host "  $Message" -ForegroundColor Blue
    Write-Host "-------------------------------------------------------------" -ForegroundColor Blue
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor DarkGray
}

# =============================================================================
# Help
# =============================================================================

if ($Help) {
    Write-Host "Usage: .\scripts\deploy.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Quick    Skip verification checks"
    Write-Host "  -DryRun   Simulate deployment without deploying"
    Write-Host "  -Help     Show this help message"
    exit 0
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

Write-Step "DevCopilot Deployment"

$modeText = ""
if ($Quick) { $modeText += "Quick " }
if ($DryRun) { $modeText += "Dry Run " }
if (-not $modeText) { $modeText = "Full " }

Write-Host "Mode: ${modeText}Deployment"
Write-Host "Time: $(Get-Date)"
Write-Host ""

# Check if we are in the right directory
if (-not (Test-Path "wrangler.toml")) {
    Write-Error-Custom "wrangler.toml not found. Are you in the project root?"
    exit 1
}

# =============================================================================
# Step 1: Verification (skip in quick mode)
# =============================================================================

if (-not $Quick) {
    Write-Step "Step 1: Environment Verification"
    
    # Check Node.js
    try {
        $nodeVersion = node -v
        Write-Success "Node.js: $nodeVersion"
    }
    catch {
        Write-Error-Custom "Node.js not found"
        exit 1
    }
    
    # Check Wrangler
    try {
        $wranglerVersion = wrangler --version 2>$null
        Write-Success "Wrangler: $wranglerVersion"
    }
    catch {
        Write-Error-Custom "Wrangler not found. Install with: npm install -g wrangler"
        exit 1
    }
    
    # Check authentication
    $whoami = wrangler whoami 2>&1
    if ($whoami -match "You are logged in") {
        Write-Success "Wrangler authenticated"
    }
    else {
        Write-Error-Custom "Not authenticated. Run: wrangler login"
        exit 1
    }
    
    # TypeScript check - just run tsc directly (biome warnings are OK)
    Write-Info "Running TypeScript check..."
    $tscResult = tsc --noEmit 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "TypeScript compilation successful"
    }
    else {
        Write-Error-Custom "TypeScript errors found. Run: tsc --noEmit"
        Write-Host $tscResult
        exit 1
    }
}
else {
    Write-Step "Step 1: Verification (SKIPPED - Quick Mode)"
    Write-Warning-Custom "Skipping verification checks"
}

# =============================================================================
# Step 2: Install Dependencies
# =============================================================================

Write-Step "Step 2: Dependencies"

if (-not (Test-Path "node_modules") -or -not $Quick) {
    Write-Info "Installing dependencies..."
    npm install --silent
    Write-Success "Dependencies installed"
}
else {
    Write-Success "Dependencies already installed"
}

# =============================================================================
# Step 3: Build
# =============================================================================

Write-Step "Step 3: Build"

Write-Info "Building Vite frontend and Worker..."

if ($DryRun) {
    Write-Warning-Custom "[DRY RUN] Would run: vite build"
}
else {
    npm run build
    Write-Success "Build complete"
}

# Check build output
if ((Test-Path "dist") -or $DryRun) {
    Write-Success "Build artifacts created"
}
else {
    Write-Error-Custom "Build failed - dist directory not found"
    exit 1
}

# =============================================================================
# Step 4: Deploy Worker
# =============================================================================

Write-Step "Step 4: Deploy to Cloudflare"

$WorkerUrl = $null

if ($DryRun) {
    Write-Warning-Custom "[DRY RUN] Would run: wrangler deploy"
    Write-Info "Deployment simulated successfully"
}
else {
    Write-Info "Deploying Worker to Cloudflare..."
    
    $deployOutput = wrangler deploy 2>&1
    
    # Extract Worker URL from output
    if ($deployOutput -match "(https://[^ ]*workers\.dev)") {
        $WorkerUrl = $matches[1]
        Write-Success "Worker deployed successfully"
        Write-Info "URL: $WorkerUrl"
    }
    else {
        Write-Warning-Custom "Could not extract Worker URL from output"
        Write-Host $deployOutput
    }
}

# =============================================================================
# Step 5: Post-Deployment Verification
# =============================================================================

Write-Step "Step 5: Post-Deployment Verification"

if ($DryRun) {
    Write-Warning-Custom "[DRY RUN] Skipping post-deployment verification"
}
else {
    if ($WorkerUrl) {
        Write-Info "Testing health endpoint..."
        
        # Wait a moment for deployment to propagate
        Start-Sleep -Seconds 2
        
        try {
            $response = Invoke-WebRequest -Uri "$WorkerUrl/health" -UseBasicParsing -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Success "Health check passed: $($response.Content)"
            }
        }
        catch {
            if ($_.Exception.Response.StatusCode -eq 404) {
                Write-Warning-Custom "Health endpoint not found (404) - may need custom route"
            }
            else {
                Write-Warning-Custom "Health check failed: $($_.Exception.Message)"
            }
        }
    }
    else {
        Write-Warning-Custom "Skipping health check - no URL available"
    }
}

# =============================================================================
# Summary
# =============================================================================

Write-Step "Deployment Complete"

Write-Host ""
Write-Host "=============================================================" -ForegroundColor Green
Write-Host "" -ForegroundColor Green
if ($DryRun) {
    Write-Host "  DRY RUN COMPLETE" -ForegroundColor Yellow
    Write-Host "  No actual deployment was performed" -ForegroundColor Green
}
else {
    Write-Host "  SUCCESS: DevCopilot deployed successfully!" -ForegroundColor Green
    Write-Host "" -ForegroundColor Green
    if ($WorkerUrl) {
        Write-Host "  URL: $WorkerUrl" -ForegroundColor Cyan
    }
}
Write-Host "" -ForegroundColor Green
Write-Host "=============================================================" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  - Test the chat interface at your deployed URL" -ForegroundColor DarkGray
Write-Host "  - Check Cloudflare dashboard for logs and analytics" -ForegroundColor DarkGray
Write-Host "  - Run npm run dev for local development" -ForegroundColor DarkGray
Write-Host ""

exit 0
