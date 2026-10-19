/**
 * A row of exclusive buttons (data-value) bound to a value. The selected one
 * gets class "on" and aria-pressed; clicking a button calls set(value).
 */
export function bindSegmented(container, { get, set }) {
  const buttons = [...container.querySelectorAll('button[data-value]')];

  function paint() {
    const current = get();
    buttons.forEach((button) => {
      const on = button.dataset.value === current;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  buttons.forEach((button) => button.addEventListener('click', () => { set(button.dataset.value); paint(); }));
  paint();
  return { paint };
}
