export interface InterfaceStatus {
  id: string;
  name: string;
  enabled: boolean;
  running: boolean;
  type?: string;
  comment?: string;
  interfaceEnabled?: boolean;
  internetBlocked?: boolean;
  natRuleId?: string;
  teacherIp?: string;
  rxRate?: number;
  txRate?: number;
  queueTreeId?: string;
  queueTreeName?: string;
  bandwidthEnabled?: boolean;
  bandwidthLimit?: number;
  bandwidthLimitMbps?: number;
  hasQueueTree?: boolean;
}

export interface RouterStatus {
  status: 'connected' | 'error' | 'loading' | 'simulated';
  message?: string;
  resource?: {
    uptime: string;
    version: string;
    'cpu-load': number;
    'total-memory': number;
    'free-memory': number;
    'board-name': string;
  };
  config?: {
    ip: string;
    user: string;
  };
}

export interface InternetStatus {
  enabled: boolean;
  mode: string;
  ruleId?: string;
}

export interface Client {
  address: string;
  mac: string;
  comment?: string;
  hostName?: string;
  status?: string;
}
