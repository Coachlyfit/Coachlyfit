-- Extensions used across the schema.
create extension if not exists pgcrypto with schema extensions;   -- gen_random_uuid(), digest()
create extension if not exists pg_trgm with schema extensions;    -- bilingual exercise/food search
