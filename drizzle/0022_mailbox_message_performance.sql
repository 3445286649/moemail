CREATE INDEX IF NOT EXISTS `message_email_id_type_received_at_idx` ON `message` (`emailId`,`type`,`received_at`,`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `message_email_id_type_sent_at_idx` ON `message` (`emailId`,`type`,`sent_at`,`id`);
