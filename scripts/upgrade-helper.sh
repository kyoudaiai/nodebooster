#!/bin/bash

# NodeBooster V1 to V2 Upgrade Helper Script
# This script helps set up and run the upgrade process

set -e

echo "🚀 NodeBooster V1 to V2 Upgrade Helper"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "hardhat.config.js" ]; then
    print_error "Please run this script from the hardhat project root directory"
    exit 1
fi

print_status "Checking environment setup..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Installing dependencies..."
    npm install
fi

# Check if contracts are compiled
if [ ! -d "artifacts" ]; then
    print_warning "Contracts not compiled. Compiling..."
    npx hardhat compile
fi

print_status "Environment setup complete"

echo ""
echo "📋 Available Options:"
echo "1. Run upgrade tests (recommended first)"
echo "2. Run actual upgrade (requires NODEBOOSTER_PROXY_ADDRESS)"
echo "3. Compile contracts only"
echo "4. Run all tests"
echo ""

read -p "Select option (1-4): " option

case $option in
    1)
        print_status "Running upgrade tests..."
        echo ""
        npx hardhat test test/upgrade-v1-to-v2.test.js
        ;;
    2)
        if [ -z "$NODEBOOSTER_PROXY_ADDRESS" ]; then
            print_error "NODEBOOSTER_PROXY_ADDRESS environment variable is required"
            echo ""
            echo "Please set the proxy address of your deployed NodeBooster V1 contract:"
            echo "export NODEBOOSTER_PROXY_ADDRESS=0x1234567890123456789012345678901234567890"
            echo ""
            echo "You can also create a .env file with:"
            echo "NODEBOOSTER_PROXY_ADDRESS=0x1234567890123456789012345678901234567890"
            exit 1
        fi
        
        print_warning "This will upgrade the contract at: $NODEBOOSTER_PROXY_ADDRESS"
        print_warning "Make sure this is the correct address and you have tested thoroughly!"
        echo ""
        read -p "Are you sure you want to proceed? (y/N): " confirm
        
        if [[ $confirm =~ ^[Yy]$ ]]; then
            print_status "Running upgrade script..."
            npx hardhat run scripts/upgrade-v1-to-v2.js --network ${HARDHAT_NETWORK:-localhost}
        else
            print_status "Upgrade cancelled"
        fi
        ;;
    3)
        print_status "Compiling contracts..."
        npx hardhat compile
        ;;
    4)
        print_status "Running all tests..."
        npx hardhat test
        ;;
    *)
        print_error "Invalid option selected"
        exit 1
        ;;
esac

print_status "Operation completed!"