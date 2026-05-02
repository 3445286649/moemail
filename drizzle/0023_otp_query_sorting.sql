CREATE INDEX IF NOT EXISTS `email_user_created_idx` ON `email` (`userId`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_user_code_activity_idx` ON `email` (`userId`,`latest_code`,COALESCE(`latest_received_at`, `created_at`),`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_user_used_activity_idx` ON `email` (`userId`,`used`,COALESCE(`latest_received_at`, `created_at`),`id`);
