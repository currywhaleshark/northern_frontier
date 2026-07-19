import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label: string;
  mode?: 'overlay' | 'panel';
}

interface ErrorState {
  failed: boolean;
}

class LazyImportErrorBoundary extends Component<Props, ErrorState> {
  state: ErrorState = { failed: false };

  static getDerivedStateFromError(): ErrorState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // 렌더 실패는 아래 복구 UI로 전환한다. 개발자 콘솔 중복 출력은 만들지 않는다.
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={`lazy-ui-error ${this.props.mode ?? 'panel'}`} role="alert">
          <span>{this.props.label} 화면을 불러오지 못했습니다.</span>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            다시 불러오기
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LazyUiBoundary({ children, label, mode = 'panel' }: Props) {
  return (
    <LazyImportErrorBoundary label={label} mode={mode}>
      <Suspense fallback={(
        <div className={`lazy-ui-fallback ${mode}`} role="status" aria-live="polite">
          {label} 불러오는 중…
        </div>
      )}>
        {children}
      </Suspense>
    </LazyImportErrorBoundary>
  );
}
