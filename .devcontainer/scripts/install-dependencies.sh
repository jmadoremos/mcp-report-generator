#!/bin/sh

# Define styles for reserved words
# See https://www.shellhacks.com/bash-colors/
ECHO_INFO="\e[1;30mINFO\e[0m"
ECHO_WARN="\e[1;33mWARN\e[0m"
ECHO_ERROR="\e[1;31mERROR\e[0m"

##########################################
# postgres-query
##########################################

# Navigate to server directory
pushd ./mcp/postgres-query > /dev/null

# Proceed only if node_modules folder does not exist
if [ ! -d "node_modules" ]; then
    echo ${ECHO_INFO}: The 'node_modules' folder does not exist.
    echo ${ECHO_INFO}: Running 'npm clean-install'...
    echo ""

    # Clean install the npm dependencies
    npm clean-install
else
    echo ${ECHO_INFO}: The 'node_modules' folder exists. Skipped clean install.
fi

# Navigate back to previous directory
popd > /dev/null

##########################################
# csv-generator
##########################################

# Navigate to server directory
pushd ./mcp/csv-generator > /dev/null

# Proceed only if node_modules folder does not exist
if [ ! -d "node_modules" ]; then
    echo ${ECHO_INFO}: The 'node_modules' folder does not exist.
    echo ${ECHO_INFO}: Running 'npm clean-install'...
    echo ""

    # Clean install the npm dependencies
    npm clean-install
else
    echo ${ECHO_INFO}: The 'node_modules' folder exists. Skipped clean install.
fi

# Navigate back to previous directory
popd > /dev/null
