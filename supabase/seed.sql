-- Local development only (never runs in production).
-- Migrations seed the demo org with whatever seed function existed at that
-- point; re-seed so it reflects the latest version.
select private.reset_demo_data();
