import type { Metadata } from 'next';
import { DEMO_API_KEY, showDemoKey } from '../lib/partner-api';
import { Playground } from '../ui/Playground';

export const metadata: Metadata = { title: 'Playground · Developers' };

export default function PlaygroundPage() {
  return <Playground demoKey={showDemoKey ? DEMO_API_KEY : null} />;
}
