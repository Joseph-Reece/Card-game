import { redirect } from 'next/navigation';

// Deep-link support: redirect to home where state-based routing takes over
export default function GameCodePage() {
  redirect('/');
}
