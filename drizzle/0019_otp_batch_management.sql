CREATE TABLE `otp_batch` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `source` text DEFAULT 'manual' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `notes` text,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `otp_batch_user_id_created_at_idx` ON `otp_batch` (`user_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `batch_id` text REFERENCES `otp_batch`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `tags` text;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `used` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `updated_at` integer;
--> statement-breakpoint
CREATE INDEX `email_batch_id_idx` ON `email` (`batch_id`);
--> statement-breakpoint
CREATE INDEX `email_used_idx` ON `email` (`used`);
