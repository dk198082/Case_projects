CREATE TABLE IF NOT EXISTS d365fo.sessions (
  sid varchar PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expire_idx
  ON d365fo.sessions (expire);