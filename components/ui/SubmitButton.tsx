'use client';

import { useFormStatus } from 'react-dom';

import { Button } from './Button';

type Props = React.ComponentProps<typeof Button>;

/** Submit button that shows a spinner while its form's server action runs. */
export function SubmitButton({ children, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...rest}>
      {children}
    </Button>
  );
}
