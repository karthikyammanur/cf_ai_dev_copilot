#!/bin/bash

# =============================================================================
# cf_ai_dev_copilot Deployment Script
# =============================================================================
#
# This script handles the complete deployment of DevCopilot to Cloudflare.
#
# Usage:
#   ./scripts/deploy.sh           # Full deployment (check + build + deploy)
#   ./scripts/deploy.sh --quick   # Quick deployment (skip checks)
#   ./scripts/deploy.sh --dry-run # Simulate deployment without actually deploying
#
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
DIM='\033[2m'

# Flags
QUICK_MODE=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --quick|-q)
      QUICK_MODE=true
      shift
      ;;
    --dry-run|-d)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "Usage: ./scripts/deploy.sh [options]"
      echo ""
      echo "Options:"
      echo "  --quick, -q    Skip verification checks"
      echo "  --dry-run, -d  Simulate deployment without deploying"
      echo "  --help, -h     Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# =============================================================================
# Helper Functions
# =============================================================================

log_step() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_info() {
  echo -e "${DIM}  $1${NC}"
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

log_step "DevCopilot Deployment"

echo -e "Mode: ${QUICK_MODE:+Quick }${DRY_RUN:+Dry Run }Deployment"
echo -e "Time: $(date)"
echo ""

# Check if we're in the right directory
if [ ! -f "wrangler.toml" ]; then
  log_error "wrangler.toml not found. Are you in the project root?"
  exit 1
fi

# =============================================================================
# Step 1: Verification (skip in quick mode)
# =============================================================================

if [ "$QUICK_MODE" = false ]; then
  log_step "Step 1: Environment Verification"
  
  # Check Node.js
  NODE_VERSION=$(node -v)
  log_success "Node.js: $NODE_VERSION"
  
  # Check Wrangler
  if command -v wrangler &> /dev/null; then
    WRANGLER_VERSION=$(wrangler --version 2>/dev/null || echo "unknown")
    log_success "Wrangler: $WRANGLER_VERSION"
  else
    log_error "Wrangler not found. Install with: npm install -g wrangler"
    exit 1
  fi
  
  # Check authentication
  if wrangler whoami 2>&1 | grep -q "You are logged in"; then
    log_success "Wrangler authenticated"
  else
    log_error "Not authenticated. Run: wrangler login"
    exit 1
  fi
  
  # TypeScript check
  log_info "Running TypeScript check..."
  if npm run check > /dev/null 2>&1; then
    log_success "TypeScript compilation successful"
  else
    log_error "TypeScript errors found. Run: npm run check"
    exit 1
  fi
else
  log_step "Step 1: Verification (SKIPPED - Quick Mode)"
  log_warning "Skipping verification checks"
fi

# =============================================================================
# Step 2: Install Dependencies
# =============================================================================

log_step "Step 2: Dependencies"

if [ ! -d "node_modules" ] || [ "$QUICK_MODE" = false ]; then
  log_info "Installing dependencies..."
  npm install --silent
  log_success "Dependencies installed"
else
  log_success "Dependencies already installed"
fi

# =============================================================================
# Step 3: Build
# =============================================================================

log_step "Step 3: Build"

log_info "Building Vite frontend and Worker..."

if [ "$DRY_RUN" = true ]; then
  log_warning "[DRY RUN] Would run: vite build"
else
  npm run build
  log_success "Build complete"
fi

# Check build output
if [ -d "dist" ] || [ "$DRY_RUN" = true ]; then
  log_success "Build artifacts created"
else
  log_error "Build failed - dist directory not found"
  exit 1
fi

# =============================================================================
# Step 4: Deploy Worker
# =============================================================================

log_step "Step 4: Deploy to Cloudflare"

if [ "$DRY_RUN" = true ]; then
  log_warning "[DRY RUN] Would run: wrangler deploy"
  log_info "Deployment simulated successfully"
else
  log_info "Deploying Worker to Cloudflare..."
  
  DEPLOY_OUTPUT=$(wrangler deploy 2>&1)
  
  # Extract Worker URL from output
  WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^ ]*workers.dev' | head -1)
  
  if [ -n "$WORKER_URL" ]; then
    log_success "Worker deployed successfully"
    log_info "URL: $WORKER_URL"
  else
    log_warning "Could not extract Worker URL from output"
    echo "$DEPLOY_OUTPUT"
  fi
fi

# =============================================================================
# Step 5: Post-Deployment Verification
# =============================================================================

log_step "Step 5: Post-Deployment Verification"

if [ "$DRY_RUN" = true ]; then
  log_warning "[DRY RUN] Skipping post-deployment verification"
else
  if [ -n "$WORKER_URL" ]; then
    log_info "Testing health endpoint..."
    
    # Wait a moment for deployment to propagate
    sleep 2
    
    HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${WORKER_URL}/health" 2>/dev/null || echo "error")
    HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
    RESPONSE_BODY=$(echo "$HEALTH_RESPONSE" | head -1)
    
    if [ "$HTTP_CODE" = "200" ]; then
      log_success "Health check passed: $RESPONSE_BODY"
    elif [ "$HTTP_CODE" = "404" ]; then
      log_warning "Health endpoint not found (404) - may need custom route"
    else
      log_warning "Health check returned: HTTP $HTTP_CODE"
    fi
  else
    log_warning "Skipping health check - no URL available"
  fi
fi

# =============================================================================
# Summary
# =============================================================================

log_step "Deployment Complete"

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${GREEN}║  ${YELLOW}DRY RUN COMPLETE${GREEN}                                       ║${NC}"
  echo -e "${GREEN}║  No actual deployment was performed                      ║${NC}"
else
  echo -e "${GREEN}║  ✓ DevCopilot deployed successfully!                     ║${NC}"
  echo -e "${GREEN}║                                                           ║${NC}"
  if [ -n "$WORKER_URL" ]; then
    echo -e "${GREEN}║  URL: ${WORKER_URL}${NC}"
  fi
fi
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"

echo ""
echo -e "Next steps:"
echo -e "  ${DIM}• Test the chat interface at your deployed URL${NC}"
echo -e "  ${DIM}• Check Cloudflare dashboard for logs and analytics${NC}"
echo -e "  ${DIM}• Run: npm run dev for local development${NC}"
echo ""

exit 0
