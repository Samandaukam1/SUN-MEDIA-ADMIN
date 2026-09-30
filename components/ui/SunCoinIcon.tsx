import Image from 'next/image';

export function SunCoinIcon({ size = 32 }: { size?: number }) {
  return <Image src="/assets/sun-coin.svg" alt="" width={size} height={size} unoptimized aria-hidden />;
}
