#!/bin/bash

# Define the file path
FILE_PATH="/home/oek/OEKundakcioglu.github.io/ip/address.md"

# Function to get external IP address
get_external_ip() {
    curl -s http://whatismyip.akamai.com/
}

# Get the external IP address
EXTERNAL_IP=$(get_external_ip)

# Write IP address to file
echo "$EXTERNAL_IP" > "$FILE_PATH"

# Commit and push to repository
cd ~/OEKundakcioglu.github.io/
git add "$FILE_PATH"
git commit -m "Update IP address"
git push origin main
