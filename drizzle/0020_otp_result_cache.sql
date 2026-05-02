ALTER TABLE `message` ADD COLUMN `otp_code` text;
--> statement-breakpoint
ALTER TABLE `message` ADD COLUMN `otp_provider` text;
--> statement-breakpoint
ALTER TABLE `message` ADD COLUMN `otp_confidence` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `message` ADD COLUMN `otp_extracted_at` integer;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `message_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `latest_message_id` text;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `latest_received_at` integer;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `latest_code` text;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `latest_otp_provider` text;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `latest_otp_confidence` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `latest_from_address` text;
--> statement-breakpoint
ALTER TABLE `email` ADD COLUMN `latest_subject` text;
--> statement-breakpoint
CREATE INDEX `email_user_latest_received_idx` ON `email` (`userId`,`latest_received_at`);
--> statement-breakpoint
CREATE INDEX `email_latest_code_idx` ON `email` (`latest_code`);
--> statement-breakpoint
CREATE INDEX `message_otp_code_idx` ON `message` (`otp_code`);
--> statement-breakpoint
UPDATE `email`
SET `message_count` = (
  SELECT COUNT(*)
  FROM `message`
  WHERE `message`.`emailId` = `email`.`id`
    AND (`message`.`type` != 'sent' OR `message`.`type` IS NULL)
);
--> statement-breakpoint
UPDATE `email`
SET
  `latest_message_id` = (
    SELECT `message`.`id`
    FROM `message`
    WHERE `message`.`emailId` = `email`.`id`
      AND (`message`.`type` != 'sent' OR `message`.`type` IS NULL)
    ORDER BY `message`.`received_at` DESC, `message`.`id` DESC
    LIMIT 1
  ),
  `latest_received_at` = (
    SELECT `message`.`received_at`
    FROM `message`
    WHERE `message`.`emailId` = `email`.`id`
      AND (`message`.`type` != 'sent' OR `message`.`type` IS NULL)
    ORDER BY `message`.`received_at` DESC, `message`.`id` DESC
    LIMIT 1
  ),
  `latest_from_address` = (
    SELECT `message`.`from_address`
    FROM `message`
    WHERE `message`.`emailId` = `email`.`id`
      AND (`message`.`type` != 'sent' OR `message`.`type` IS NULL)
    ORDER BY `message`.`received_at` DESC, `message`.`id` DESC
    LIMIT 1
  ),
  `latest_subject` = (
    SELECT `message`.`subject`
    FROM `message`
    WHERE `message`.`emailId` = `email`.`id`
      AND (`message`.`type` != 'sent' OR `message`.`type` IS NULL)
    ORDER BY `message`.`received_at` DESC, `message`.`id` DESC
    LIMIT 1
  );
