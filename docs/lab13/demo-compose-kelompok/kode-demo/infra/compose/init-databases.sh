#!/bin/sh
set -eu
for service in order payment; do
  name="zenta_$service"
  createdb --username "$POSTGRES_USER" "$name"
  for migration in /migrations/"$service"/*.sql; do
    psql --username "$POSTGRES_USER" --dbname "$name" --set ON_ERROR_STOP=on --file "$migration"
  done
done
