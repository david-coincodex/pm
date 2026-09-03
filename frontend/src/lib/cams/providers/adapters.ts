import 'server-only';
import type { CamProviderAdapter } from '../types';
import { chaturbate } from './chaturbate';
import { bongacams } from './bongacams';
import { imlive } from './imlive';
import { stripchat } from './stripchat';

/**
 * Every provider's feed adapter, enabled or not. Server-only (the feeds read credentials).
 *
 * The registry registers `ALL_ADAPTERS.filter((a) => a.enabled())`, so adding a provider means
 * adding one line here — never a conditional in the registry. Order sets nothing functionally
 * (models are sorted by viewers downstream); keep it stable for readable logs.
 */
export const ALL_ADAPTERS: CamProviderAdapter[] = [chaturbate, bongacams, imlive, stripchat];
