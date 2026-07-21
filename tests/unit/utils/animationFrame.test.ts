import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
} from '@/utils/animationFrame';

describe('animationFrame scheduling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('schedules and cancels RAF on the owner window', () => {
    const callback = jest.fn();
    const ownerRequestAnimationFrame = jest.fn<
      ReturnType<Window['requestAnimationFrame']>,
      Parameters<Window['requestAnimationFrame']>
    >().mockReturnValue(123);
    const ownerCancelAnimationFrame = jest.fn<void, [number]>();
    const ownerWindow = {
      requestAnimationFrame: ownerRequestAnimationFrame,
      cancelAnimationFrame: ownerCancelAnimationFrame,
    } as unknown as Window;

    const frame = scheduleAnimationFrame(callback, ownerWindow);

    expect(frame).toEqual({ kind: 'raf', id: 123, ownerWindow });
    expect(ownerRequestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));

    cancelScheduledAnimationFrame(frame);

    expect(ownerCancelAnimationFrame).toHaveBeenCalledWith(123);
  });

  it('schedules and clears timeout fallback on the owner window', () => {
    const callback = jest.fn();
    const ownerSetTimeout = jest.fn<
      ReturnType<Window['setTimeout']>,
      Parameters<Window['setTimeout']>
    >().mockReturnValue(456);
    const ownerClearTimeout = jest.fn<void, [number]>();
    const ownerWindow = {
      requestAnimationFrame: undefined,
      setTimeout: ownerSetTimeout,
      clearTimeout: ownerClearTimeout,
    } as unknown as Window;

    const frame = scheduleAnimationFrame(callback, ownerWindow);

    expect(frame).toEqual({ kind: 'timeout', id: 456, ownerWindow });
    expect(ownerSetTimeout).toHaveBeenCalledWith(callback, 16);

    cancelScheduledAnimationFrame(frame);

    expect(ownerClearTimeout).toHaveBeenCalledWith(456);
  });
});
