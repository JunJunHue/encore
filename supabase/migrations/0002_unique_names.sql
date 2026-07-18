-- Name-login: display names are identities, so they must be unique
-- (case-insensitively). Name-login accounts are additionally unique at the
-- auth level via their synthetic email (<name-slug>@name.encore.demo).
create unique index if not exists profiles_display_name_unique
  on profiles (lower(display_name));
