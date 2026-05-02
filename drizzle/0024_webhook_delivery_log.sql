CREATE TABLE IF NOT EXISTS `webhook_delivery` (
  `id` text PRIMARY KEY NOT NULL,
  `webhook_id` text,
  `user_id` text NOT NULL,
  `message_id` text,
  `email_id` text,
  `event` text NOT NULL,
  `target_url` text NOT NULL,
  `status` text NOT NULL,
  `http_status` integer,
  `attempts` integer DEFAULT 1 NOT NULL,
  `duration_ms` integer,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`webhook_id`) REFERENCES `webhook`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`email_id`) REFERENCES `email`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webhook_delivery_user_created_idx` ON `webhook_delivery` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webhook_delivery_message_idx` ON `webhook_delivery` (`message_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webhook_delivery_status_idx` ON `webhook_delivery` (`status`);
