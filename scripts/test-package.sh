#!/bin/bash

# AI Chat Watch - Package Testing Script
# This script tests npm packaging in a clean, isolated environment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="aicw"
TMP_DIR="/tmp/${PACKAGE_NAME}-test-$$"
PACKAGE_FILE=""

# Print colored output
print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Cleanup function
cleanup() {
    if [ -d "$TMP_DIR" ]; then
        print_step "Cleaning up temporary directory..."
        rm -rf "$TMP_DIR"
    fi

    # Clean up any .tgz files in /tmp
    rm -f /tmp/${PACKAGE_NAME}-*.tgz

    print_success "Cleanup complete"
}

# Trap to ensure cleanup runs on exit
trap cleanup EXIT

# Main testing process
main() {
    print_step "Starting package testing for ${PACKAGE_NAME}"
    echo ""

    # Step 1: Build the project
    print_step "Building the project..."
    npm run build
    print_success "Build complete"
    echo ""

    # Step 2: Create package in /tmp
    print_step "Creating npm package in /tmp..."
    npm pack --pack-destination /tmp
    PACKAGE_FILE=$(ls -t /tmp/${PACKAGE_NAME}-*.tgz | head -1)

    if [ -z "$PACKAGE_FILE" ]; then
        print_error "Failed to create package"
        exit 1
    fi

    PACKAGE_SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)
    print_success "Package created: $(basename $PACKAGE_FILE) (${PACKAGE_SIZE})"
    echo ""

    # Step 3: Verify package contents
    print_step "Verifying package contents..."
    tar -tzf "$PACKAGE_FILE" | head -20

    # Check for critical files
    CRITICAL_FILES=(
        "package/LICENSE"
        "package/NOTICE"
        "package/README.md"
        "package/bin/aicw.js"
        "package/dist/run.js"
        "package/src/config/templates/"
    )

    echo ""
    print_step "Checking critical files..."
    for file in "${CRITICAL_FILES[@]}"; do
        if tar -tzf "$PACKAGE_FILE" | grep -q "^$file"; then
            echo -e "  ${GREEN}✓${NC} $file"
        else
            echo -e "  ${RED}✗${NC} $file (MISSING)"
        fi
    done
    echo ""

    # Step 4: Test installation
    print_step "Testing installation in isolated environment..."
    mkdir -p "$TMP_DIR"
    cd "$TMP_DIR"

    # Initialize a test project
    npm init -y > /dev/null 2>&1

    # Install the package
    print_step "Installing package from tarball..."
    npm install "$PACKAGE_FILE"

    if [ -d "node_modules/${PACKAGE_NAME}" ]; then
        print_success "Package installed successfully"
    else
        print_error "Package installation failed"
        exit 1
    fi
    echo ""

    # Step 5: Test the CLI command
    print_step "Testing CLI command..."
    if npx ${PACKAGE_NAME} help > /dev/null 2>&1; then
        print_success "CLI command works"
    else
        print_error "CLI command failed"
        exit 1
    fi

    # Step 6: Check installed structure
    print_step "Verifying installed file structure..."
    INSTALLED_DIR="node_modules/${PACKAGE_NAME}"

    echo "  Checking directories:"
    for dir in bin dist src/config; do
        if [ -d "${INSTALLED_DIR}/$dir" ]; then
            echo -e "    ${GREEN}✓${NC} $dir/"
        else
            echo -e "    ${RED}✗${NC} $dir/ (MISSING)"
        fi
    done

    echo ""
    echo "  Checking key files:"
    for file in LICENSE NOTICE package.json; do
        if [ -f "${INSTALLED_DIR}/$file" ]; then
            echo -e "    ${GREEN}✓${NC} $file"
        else
            echo -e "    ${RED}✗${NC} $file (MISSING)"
        fi
    done
    echo ""

    # Final summary
    print_success "Package testing completed successfully!"
    echo ""
    echo "Summary:"
    echo "  • Package: $(basename $PACKAGE_FILE)"
    echo "  • Size: ${PACKAGE_SIZE}"
    echo "  • Location: $PACKAGE_FILE"
    echo ""
    print_warning "Remember to run 'npm run pack:clean' to remove test files"
}

# Run the main function
main "$@"