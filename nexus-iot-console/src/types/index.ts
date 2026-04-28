export type DeviceStatus = 'online' | 'offline' | 'warning' | 'error';

export interface Device {
  id: string;
  name: string;
  productKey: string;
  status: DeviceStatus;
  lastSeen: string;
  firmwareVersion: string;
  ip: string;
  tags: string[];
}

export interface Product {
  id: string;
  name: string;
  key: string;
  protocol: 'MQTT' | 'HTTP' | 'CoAP';
  deviceCount: number;
  onlineRate: number;
  createdAt: string;
}

export interface Stat {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
}
