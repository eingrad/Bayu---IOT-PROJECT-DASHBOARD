-- ====================================================================
-- Bayu Sense — additional application tables
-- Runs AFTER 01-init.sql (which creates users, wind_data, particle_data,
-- the app_admin / app_user roles, and RLS on users).
-- These tables are referenced by server/index.js and public-api but were
-- missing from the original schema.
-- ====================================================================

-- 1. companies -------------------------------------------------------
CREATE TABLE companies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(120) NOT NULL,
  email_domain VARCHAR(120) NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Link users to a company (nullable: e.g. the seeded super-admin)
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Per-user preferences (e.g. display units chosen in Sensor Settings)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. devices ---------------------------------------------------------
-- NOTE: the app is inconsistent about device keys — server/index.js and
-- public-api sensorData use devices.id, while public-api register inserts
-- devices.device_id. Both columns are provided so every query works.
CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id     VARCHAR(120) UNIQUE,                 -- hardware/external id
  device_name   VARCHAR(120),
  serial_number VARCHAR(120),
  model         VARCHAR(120),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  location      VARCHAR(200),
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  battery       REAL,
  status        VARCHAR(30) DEFAULT 'offline',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link sensor readings to a device (nullable so existing inserts keep working)
ALTER TABLE wind_data     ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(id);
ALTER TABLE particle_data ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(id);

CREATE INDEX idx_wind_data_device_id     ON wind_data(device_id);
CREATE INDEX idx_particle_data_device_id ON particle_data(device_id);

-- Gas readings (CO, SO2, O3, NO2)
CREATE TABLE gas_data (
  id          BIGSERIAL PRIMARY KEY,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  co          REAL,
  so2         REAL,
  o3          REAL,
  no2         REAL,
  device_id   UUID REFERENCES devices(id)
);
CREATE INDEX idx_gas_data_measured_at ON gas_data(measured_at);
CREATE INDEX idx_gas_data_device_id   ON gas_data(device_id);
GRANT SELECT, INSERT ON gas_data TO app_user, app_admin;

-- 3. licenses --------------------------------------------------------
CREATE TABLE licenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_key VARCHAR(120) NOT NULL UNIQUE,
  company     VARCHAR(120),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  status      VARCHAR(30) NOT NULL DEFAULT 'active'
);

-- 4. telegram_users --------------------------------------------------
CREATE TABLE telegram_users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username   VARCHAR(120) NOT NULL UNIQUE,        -- ON CONFLICT (username) target
  chat_id    BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. alert_rules -----------------------------------------------------
CREATE TABLE alert_rules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  parameter        VARCHAR(50) NOT NULL,
  threshold        NUMERIC NOT NULL,
  telegram_chat_id BIGINT,
  username         VARCHAR(120),
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- Privileges (these tables have no RLS; grants alone control access)
-- ====================================================================
GRANT SELECT                         ON companies      TO app_user, app_admin;
GRANT INSERT, UPDATE, DELETE         ON companies      TO app_admin;

GRANT SELECT                         ON devices        TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON devices        TO app_admin;

GRANT SELECT                         ON licenses       TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON licenses       TO app_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON telegram_users TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_rules    TO app_user, app_admin;

-- Sequences (harmless for the UUID PKs; covers the BIGSERIAL sensor ids)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_admin;

-- ====================================================================
-- Seed data so the dashboard has something to show
-- ====================================================================
INSERT INTO companies (name, email_domain)
VALUES ('EETSB', 'eetsb.com');

-- Attach the seeded admin (from 01-init.sql) to the company
UPDATE users
   SET company_id = (SELECT id FROM companies WHERE email_domain = 'eetsb.com')
 WHERE username = 'admin@eetsb.com';

-- A regular (non-admin) user you can log in with
INSERT INTO users (username, password_hash, role, company_id)
VALUES (
  'user@eetsb.com',
  crypt('user1234', gen_salt('bf')),
  'user',
  (SELECT id FROM companies WHERE email_domain = 'eetsb.com')
);

-- A demo device owned by the admin
INSERT INTO devices (id, device_id, device_name, serial_number, model, user_id, location, latitude, longitude, battery, status)
VALUES (
  'd6fb0a5d-2311-44fd-9657-2f9003e52602',
  'BAYU-DEMO-01',
  'Bayu Demo Sensor',
  'BYS-2026-0001',
  'Bayu Sense AQ-1',
  (SELECT id FROM users WHERE username = 'admin@eetsb.com'),
  'Kuala Lumpur',
  3.1390, 101.6869,
  98, 'online'
);

-- A demo license for the admin
INSERT INTO licenses (license_key, company, user_id, issued_at, expires_at, status)
VALUES (
  'BAYU-DEMO-LICENSE-0001',
  'EETSB',
  (SELECT id FROM users WHERE username = 'admin@eetsb.com'),
  NOW(),
  NOW() + INTERVAL '1 year',
  'active'
);
