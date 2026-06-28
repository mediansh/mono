/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admins from "../admins.js";
import type * as apiKeys from "../apiKeys.js";
import type * as benchmarks from "../benchmarks.js";
import type * as benchmarks_fixtures from "../benchmarks/fixtures.js";
import type * as benchmarks_lib from "../benchmarks/lib.js";
import type * as benchmarks_suites from "../benchmarks/suites.js";
import type * as billing from "../billing.js";
import type * as billingTracking from "../billingTracking.js";
import type * as blogPosts from "../blogPosts.js";
import type * as changelogEntries from "../changelogEntries.js";
import type * as cli from "../cli.js";
import type * as discord from "../discord.js";
import type * as discordFeedback from "../discordFeedback.js";
import type * as earlyAccess from "../earlyAccess.js";
import type * as feedbackApi from "../feedbackApi.js";
import type * as feedbackAttachments from "../feedbackAttachments.js";
import type * as github from "../github.js";
import type * as http from "../http.js";
import type * as linear from "../linear.js";
import type * as logs from "../logs.js";
import type * as moduleRuns from "../moduleRuns.js";
import type * as permissions from "../permissions.js";
import type * as posthog from "../posthog.js";
import type * as slack from "../slack.js";
import type * as slackFeedback from "../slackFeedback.js";
import type * as status from "../status.js";
import type * as taskComments from "../taskComments.js";
import type * as taskSourceUtils from "../taskSourceUtils.js";
import type * as tasks from "../tasks.js";
import type * as tasksApi from "../tasksApi.js";
import type * as users from "../users.js";
import type * as waitlist from "../waitlist.js";
import type * as workspaces from "../workspaces.js";
import type * as x from "../x.js";
import type * as xFeedback from "../xFeedback.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admins: typeof admins;
  apiKeys: typeof apiKeys;
  benchmarks: typeof benchmarks;
  "benchmarks/fixtures": typeof benchmarks_fixtures;
  "benchmarks/lib": typeof benchmarks_lib;
  "benchmarks/suites": typeof benchmarks_suites;
  billing: typeof billing;
  billingTracking: typeof billingTracking;
  blogPosts: typeof blogPosts;
  changelogEntries: typeof changelogEntries;
  cli: typeof cli;
  discord: typeof discord;
  discordFeedback: typeof discordFeedback;
  earlyAccess: typeof earlyAccess;
  feedbackApi: typeof feedbackApi;
  feedbackAttachments: typeof feedbackAttachments;
  github: typeof github;
  http: typeof http;
  linear: typeof linear;
  logs: typeof logs;
  moduleRuns: typeof moduleRuns;
  permissions: typeof permissions;
  posthog: typeof posthog;
  slack: typeof slack;
  slackFeedback: typeof slackFeedback;
  status: typeof status;
  taskComments: typeof taskComments;
  taskSourceUtils: typeof taskSourceUtils;
  tasks: typeof tasks;
  tasksApi: typeof tasksApi;
  users: typeof users;
  waitlist: typeof waitlist;
  workspaces: typeof workspaces;
  x: typeof x;
  xFeedback: typeof xFeedback;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  discordFeedbackWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"discordFeedbackWorkpool">;
  xFeedbackWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"xFeedbackWorkpool">;
  slackFeedbackWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"slackFeedbackWorkpool">;
};
