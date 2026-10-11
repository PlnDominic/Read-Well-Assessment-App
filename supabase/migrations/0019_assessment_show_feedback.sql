-- A per-form switch for the student game's right-and-wrong feedback.
--
-- On (the default, and how every game form behaved until now): a wrong pick
-- shakes and shows a gentle "try again", a right pick turns green, and the
-- child gets one practice retry; only their first answer is scored.
--
-- Off: the game says nothing about right or wrong, the child can change
-- their pick until they move on, and the last pick is scored. Use it where
-- a form must be given strictly by its guide (the ReadWell guide says never
-- to correct a child on a scored item).
--
-- The setting belongs to a version of the form (saving a form on the
-- Content page makes a new version), so a session's assessment always
-- records which way it was given.

alter table public.assessments add column show_feedback boolean not null default true;

notify pgrst, 'reload schema';
