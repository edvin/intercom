-- What happened to each browser's last notification: the push service's answer, or an error the phone reported.
ALTER TABLE push_subs ADD COLUMN last_at INTEGER;
ALTER TABLE push_subs ADD COLUMN last_status TEXT NOT NULL DEFAULT '';
