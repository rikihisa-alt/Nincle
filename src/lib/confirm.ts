/**
 * 消す・抜ける・確定するなど、取り返しのつかない操作の前に聞く。
 * 端末ごとに違う小さなダイアログではなく、大きな文字とボタンの共通画面（components/confirm-host.tsx）で出す。
 */
export type ConfirmRequest = {
  title: string;
  message: string;
  okLabel: string;
  resolve: (ok: boolean) => void;
};

let show: ((req: ConfirmRequest) => void) | null = null;

/** ConfirmHost が登録する */
export function registerConfirmHost(fn: ((req: ConfirmRequest) => void) | null) {
  show = fn;
}

export function confirm(title: string, message: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      resolve(false);
      return;
    }
    show({ title, message, okLabel, resolve });
  });
}
