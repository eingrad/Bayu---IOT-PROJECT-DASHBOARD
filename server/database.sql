-- ====================================================================
-- FULL POSTGRESQL SETUP SCRIPT:
-- Schema, Security (Roles, Grants, RLS), Triggers, Indexes, Seed Data
-- ====================================================================

-- 1. ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 2. TYPE DEFINITIONS
-- ====================================================================
CREATE TYPE user_role AS ENUM ('admin', 'user');

-- ====================================================================
-- 3. TABLES & TRIGGERS
-- ====================================================================

-- 3.1 users: store application users (admins + normal users)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Trigger function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to users table
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

-- 3.2 wind_data: sensor readings for wind & environmental data
CREATE TABLE wind_data (
  id             BIGSERIAL PRIMARY KEY,
  measured_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  wind_speed     REAL    NOT NULL,    
  wind_direction REAL    NOT NULL,    
  temperature    REAL    NOT NULL,    
  humidity       REAL    NOT NULL,    
  pressure       REAL    NOT NULL     
);

-- 3.3 particle_data: sensor readings for particulate matter
CREATE TABLE particle_data (
  id           BIGSERIAL PRIMARY KEY,
  measured_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  pm25         REAL NOT NULL,      
  pm10         REAL NOT NULL,      
  tsp          REAL NOT NULL       
);

-- ====================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ====================================================================
CREATE INDEX idx_wind_data_measured_at     ON wind_data(measured_at);
CREATE INDEX idx_particle_data_measured_at ON particle_data(measured_at);

-- ====================================================================
-- 5. DATABASE ROLES & PRIVILEGES
-- ====================================================================

-- 5.1 Create two DB logins for the application
--     • app_admin: used by admin-facing parts of the app
--     • app_user:  used by normal users (including sensor write operations)
CREATE ROLE app_admin LOGIN PASSWORD 'bayu_admin_pass!';
CREATE ROLE app_user  LOGIN PASSWORD 'bayu_user_pass!';

-- 5.2 Revoke default public privileges on schema and tables
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_admin, app_user;

REVOKE ALL ON TABLE users        FROM PUBLIC;
REVOKE ALL ON TABLE wind_data    FROM PUBLIC;
REVOKE ALL ON TABLE particle_data FROM PUBLIC;

-- 5.3 Grant privileges on users table
--     • app_admin can SELECT, INSERT, UPDATE, DELETE
--     • app_user has no direct privileges (RLS policies will handle)
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO app_admin;

-- 5.4 Grant privileges on sensor data tables
--     Both roles can INSERT new readings and SELECT existing data
GRANT SELECT, INSERT ON wind_data     TO app_user, app_admin;
GRANT SELECT, INSERT ON particle_data TO app_user, app_admin;

-- ====================================================================
-- 6. ROW-LEVEL SECURITY (RLS) ON users TABLE
-- ====================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 6.1 Only app_admin session can INSERT into users
CREATE POLICY users_insert_policy
  ON users
  FOR INSERT
  TO app_admin
  WITH CHECK (true);

-- 6.2 SELECT policies:
--     • app_admin can see all users
--     • app_user can only see their own row
CREATE POLICY users_select_admin
  ON users
  FOR SELECT
  TO app_admin
  USING (true);

CREATE POLICY users_select_user
  ON users
  FOR SELECT
  TO app_user
  USING ( id = current_setting('app.current_user_id')::uuid );

-- 6.3 UPDATE/DELETE policies (optional: lock down as needed)
--     Here we allow only app_admin to UPDATE or DELETE any user
CREATE POLICY users_update_admin
  ON users
  FOR UPDATE
  TO app_admin
  USING (true);

CREATE POLICY users_delete_admin
  ON users
  FOR DELETE
  TO app_admin
  USING (true);

-- ====================================================================
-- 7. SEED DATA
-- ====================================================================

-- 7.1 Insert initial application admin user
--     Replace 'supersecret' with a strong password
INSERT INTO users (username, password_hash, role)
VALUES (
  'admin@eetsb.com',
  crypt('supersecret', gen_salt('bf')),
  'admin'
);

-- ====================================================================
-- 8. USAGE NOTES
-- ====================================================================
-- • Application must open two DB connections/pools:
--     - As role app_admin for admin operations (e.g., user management)
--     - As role app_user  for normal operations (sensor writes, data read)
--
-- • After authenticating a normal user, application must execute:
--     SET app.current_user_id = '<that-user-UUID>';
--   on the app_user session so RLS SELECT policy works.
--
-- • Sensor/backend writes to wind_data & particle_data use the app_user role.
--   They INSERT new readings; no special RLS needed on those tables.
--
-- • Middleware or application logic still handles JWT/session validation
--   before choosing app_admin vs app_user connection.

-- ====================================================================
-- End of script.
-- ====================================================================
