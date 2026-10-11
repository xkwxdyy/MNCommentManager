import { act } from 'react';

export async function chooseHtmlOption(trigger, value) {
  if (!trigger) throw new Error('Missing HTML select trigger');
  await act(async () => trigger.click());
  const options = trigger.parentElement.querySelectorAll('[role="option"]');
  const option = [...options].find(node => node.dataset.value === String(value));
  if (!option) throw new Error(`Missing option ${value}`);
  await act(async () => option.click());
}
