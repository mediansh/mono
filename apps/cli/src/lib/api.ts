import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type { Task, TaskStatus, TaskPriority } from "../types.ts"

type ValidateKeyResult = {
  workspaceId: string
  workspaceName: string
  workspacePrefix: string
  labels: { name: string; color: string }[]
}

type CreateTaskResult = {
  _id: string
  taskCode: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
} | null

type UpdateStatusResult = {
  taskCode: string
  title: string
  previousStatus: TaskStatus
  newStatus: TaskStatus
}

const validateKeyRef = makeFunctionReference<
  "query",
  { apiKey: string },
  ValidateKeyResult
>("cli:validateKey")

const listTasksRef = makeFunctionReference<
  "query",
  {
    apiKey: string
    status?: TaskStatus
    priority?: TaskPriority
    label?: string
  },
  Task[]
>("cli:listTasks")

const getTaskByCodeRef = makeFunctionReference<
  "query",
  { apiKey: string; taskCode: string },
  Task | null
>("cli:getTaskByCode")

const createTaskRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string
    title: string
    description?: string
    status: TaskStatus
    priority: TaskPriority
    labels: string[]
    agentName?: string
  },
  CreateTaskResult
>("cli:createTask")

const updateTaskStatusRef = makeFunctionReference<
  "mutation",
  {
    apiKey: string
    taskCode: string
    status: TaskStatus
    agentName?: string
  },
  UpdateStatusResult
>("cli:updateTaskStatus")

export class MedianApi {
  private client: ConvexHttpClient
  private apiKey: string

  constructor(convexUrl: string, apiKey: string) {
    this.client = new ConvexHttpClient(convexUrl)
    this.apiKey = apiKey
  }

  async validateKey(): Promise<ValidateKeyResult> {
    return this.client.query(validateKeyRef, { apiKey: this.apiKey })
  }

  async listTasks(filters?: {
    status?: TaskStatus
    priority?: TaskPriority
    label?: string
  }): Promise<Task[]> {
    return this.client.query(listTasksRef, {
      apiKey: this.apiKey,
      ...filters,
    })
  }

  async getTaskByCode(taskCode: string): Promise<Task | null> {
    return this.client.query(getTaskByCodeRef, {
      apiKey: this.apiKey,
      taskCode,
    })
  }

  async createTask(input: {
    title: string
    description?: string
    status: TaskStatus
    priority: TaskPriority
    labels: string[]
    agentName?: string
  }): Promise<CreateTaskResult> {
    return this.client.mutation(createTaskRef, {
      apiKey: this.apiKey,
      ...input,
    })
  }

  async updateTaskStatus(
    taskCode: string,
    status: TaskStatus,
    agentName?: string
  ): Promise<UpdateStatusResult> {
    return this.client.mutation(updateTaskStatusRef, {
      apiKey: this.apiKey,
      taskCode,
      status,
      agentName,
    })
  }
}
