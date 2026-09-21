import { FlagBanner } from '@/registry/boxbox/ui/flag-banner';
import type { ControlValues } from '../types';
import controls from './controls';

export default function FlagBannerDemo({
  status,
  sector,
  message,
  visible,
  align,
  size,
}: ControlValues<typeof controls.fields>) {
  return (
    <FlagBanner
      status={status}
      sector={sector === 0 ? undefined : sector}
      message={message === '' ? undefined : message}
      visible={visible}
      align={align}
      size={size}
    />
  );
}
