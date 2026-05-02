import { integer, sqliteTable, text, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core"
import type { AdapterAccountType } from "next-auth/adapters"
import { relations, sql } from 'drizzle-orm';

// https://authjs.dev/getting-started/adapters/drizzle
export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  username: text("username").unique(),
  password: text("password"),
})
export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index("account_user_id_idx").on(account.userId),
  })
)

export const emailBatches = sqliteTable("otp_batch", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  source: text("source").notNull().default("manual"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  notes: text("notes"),
}, (table) => ({
  userIdCreatedAtIdx: index("otp_batch_user_id_created_at_idx").on(table.userId, table.createdAt),
}))

export const otpUserStates = sqliteTable("otp_user_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  version: integer("version", { mode: "timestamp_ms" }).notNull().default(sql`0`),
  total: integer("total").notNull().default(0),
  messageCount: integer("message_count").notNull().default(0),
  codeCount: integer("code_count").notNull().default(0),
  receivedCount: integer("received_count").notNull().default(0),
  emptyCount: integer("empty_count").notNull().default(0),
  usedCount: integer("used_count").notNull().default(0),
  latestReceivedAt: integer("latest_received_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`0`),
}, (table) => ({
  versionIdx: index("otp_user_state_version_idx").on(table.version),
}))

export const emails = sqliteTable("email", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  address: text("address").notNull().unique(),
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
  batchId: text("batch_id").references(() => emailBatches.id, { onDelete: "set null" }),
  tags: text("tags"),
  used: integer("used", { mode: "boolean" }).default(false),
  messageCount: integer("message_count").notNull().default(0),
  latestMessageId: text("latest_message_id"),
  latestReceivedAt: integer("latest_received_at", { mode: "timestamp_ms" }),
  latestCode: text("latest_code"),
  latestOtpProvider: text("latest_otp_provider"),
  latestOtpConfidence: integer("latest_otp_confidence").notNull().default(0),
  latestFromAddress: text("latest_from_address"),
  latestSubject: text("latest_subject"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => ({
  expiresAtIdx: index("email_expires_at_idx").on(table.expiresAt),
  userIdIdx: index("email_user_id_idx").on(table.userId),
  batchIdIdx: index("email_batch_id_idx").on(table.batchId),
  usedIdx: index("email_used_idx").on(table.used),
  addressLowerIdx: index("email_address_lower_idx").on(sql`LOWER(${table.address})`),
  userLatestReceivedIdx: index("email_user_latest_received_idx").on(table.userId, table.latestReceivedAt),
  userExpiresUpdatedIdx: index("email_user_expires_updated_idx").on(table.userId, table.expiresAt, table.updatedAt),
  userActivityIdx: index("email_user_activity_idx").on(table.userId, sql`COALESCE(${table.latestReceivedAt}, ${table.createdAt})`, table.id),
  userBatchIdx: index("email_user_batch_idx").on(table.userId, table.batchId),
  userUsedIdx: index("email_user_used_idx").on(table.userId, table.used),
  userAddressLowerIdx: index("email_user_address_lower_idx").on(table.userId, sql`LOWER(${table.address})`),
  latestCodeIdx: index("email_latest_code_idx").on(table.latestCode),
}))

export const messages = sqliteTable("message", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  emailId: text("emailId")
    .notNull()
    .references(() => emails.id, { onDelete: "cascade" }),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  html: text("html"),
  type: text("type"),
  otpCode: text("otp_code"),
  otpProvider: text("otp_provider"),
  otpConfidence: integer("otp_confidence").notNull().default(0),
  otpExtractedAt: integer("otp_extracted_at", { mode: "timestamp_ms" }),
  receivedAt: integer("received_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  sentAt: integer("sent_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
	  emailIdIdx: index("message_email_id_idx").on(table.emailId),
	  emailIdReceivedAtTypeIdx: index("message_email_id_received_at_type_idx").on(table.emailId, table.receivedAt, table.type),
	  emailIdTypeReceivedAtIdx: index("message_email_id_type_received_at_idx").on(table.emailId, table.type, table.receivedAt, table.id),
	  emailIdTypeSentAtIdx: index("message_email_id_type_sent_at_idx").on(table.emailId, table.type, table.sentAt, table.id),
	  otpCodeIdx: index("message_otp_code_idx").on(table.otpCode),
	}))

export const webhooks = sqliteTable('webhook', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url: text('url').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('webhook_user_id_idx').on(table.userId),
}))

export const roles = sqliteTable("role", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const userRoles = sqliteTable("user_role", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.roleId] }),
  userIdIdx: index("user_role_user_id_idx").on(table.userId),
}));

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  key: text('key').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
}, (table) => ({
  nameUserIdUnique: uniqueIndex('name_user_id_unique').on(table.name, table.userId),
  userIdIdx: index('api_keys_user_id_idx').on(table.userId),
}));

export const emailShares = sqliteTable('email_share', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  emailId: text('email_id')
    .notNull()
    .references(() => emails.id, { onDelete: "cascade" }),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
}, (table) => ({
  emailIdIdx: index('email_share_email_id_idx').on(table.emailId),
  tokenIdx: index('email_share_token_idx').on(table.token),
}));

export const messageShares = sqliteTable('message_share', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
}, (table) => ({
  messageIdIdx: index('message_share_message_id_idx').on(table.messageId),
  tokenIdx: index('message_share_token_idx').on(table.token),
}));



export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  apiKeys: many(apiKeys),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const emailSharesRelations = relations(emailShares, ({ one }) => ({
  email: one(emails, {
    fields: [emailShares.emailId],
    references: [emails.id],
  }),
}));

export const messageSharesRelations = relations(messageShares, ({ one }) => ({
  message: one(messages, {
    fields: [messageShares.messageId],
    references: [messages.id],
  }),
}));
