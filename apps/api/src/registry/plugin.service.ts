import { Inject, Injectable, NotFoundException } from '@nestjs/common'

import type { Plugin, RegistryResponse } from '@harnesshub/types'

import { PLUGIN_REPOSITORY, type PluginRepository } from './plugin.repository.js'

@Injectable()
export class PluginService {
  constructor(@Inject(PLUGIN_REPOSITORY) private readonly repository: PluginRepository) {}

  async list(query?: string): Promise<RegistryResponse> {
    const data = await this.repository.list(query)
    return { data, total: data.length }
  }

  async getById(id: string): Promise<Plugin> {
    const plugin = await this.repository.getById(id)
    if (!plugin) {
      throw new NotFoundException(`Plugin '${id}' was not found in the registry.`)
    }
    return plugin
  }
}
