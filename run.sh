#!/bin/sh

# Exit script on error
set -e

# Need debug flag or it will not show much in the way of errors
# npm run db:migrate -- --debug

node dist/main.js
