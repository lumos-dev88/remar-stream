/**
 * Fullscreenable 组件单元测试
 *
 * 验证：
 * 1. open=false 时不渲染任何内容
 * 2. open=true 时通过 Portal 渲染到 document.body
 * 3. ESC 键触发 onClose
 * 4. 点击 backdrop 触发 onClose
 * 5. 点击内容区域不触发 onClose（事件冒泡控制）
 * 6. 关闭按钮触发 onClose（仅一次，不冒泡）
 * 7. 滚动锁定在 open 时生效
 * 8. 主题继承（data-theme 复制）
 * 9. closeOnBackdropClick=false 时点击背景不关闭
 * 10. closeOnEsc=false 时 ESC 不关闭
 * 11. 从 open 切换到 closed 时移除 Portal
 * 12. 无障碍属性
 * 13. CSS 类名正确（BEM: remar-fs）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { Fullscreenable } from './Fullscreenable';
import { resetScrollLock } from '../hooks/useBodyScrollLock';

beforeEach(() => {
  resetScrollLock();
  document.body.style.overflow = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  resetScrollLock();
  document.body.style.overflow = '';
});

describe('Fullscreenable', () => {
  // ============================================================
  // Test 1: open=false 时不渲染
  // ============================================================
  it('should not render anything when open=false', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Fullscreenable open={false} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    expect(container.innerHTML).toBe('');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  // ============================================================
  // Test 2: open=true 时通过 Portal 渲染到 document.body
  // ============================================================
  it('should render overlay to document.body via Portal when open=true', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose}>
        <div data-testid="fs-content">Hello</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('remar-fs');
    expect(dialog).toHaveClass('remar-container');

    expect(screen.getByTestId('fs-content')).toBeInTheDocument();
    expect(screen.getByTestId('fs-content')).toHaveTextContent('Hello');
  });

  // ============================================================
  // Test 3: ESC 键触发 onClose
  // ============================================================
  it('should call onClose when ESC is pressed', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // Test 4: 点击 backdrop 触发 onClose
  // ============================================================
  it('should call onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose}>
        <div data-testid="inner">Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    const dialog = document.body.querySelector('[role="dialog"]')!;
    act(() => {
      fireEvent.click(dialog);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // Test 5: 点击内容区域不触发 onClose（事件冒泡控制）
  // ============================================================
  it('should NOT call onClose when content area is clicked (stopPropagation)', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose}>
        <div data-testid="inner-content">Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    const content = document.body.querySelector('.remar-fs__content')!;
    act(() => {
      fireEvent.click(content);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  // ============================================================
  // Test 6: 关闭按钮触发 onClose（仅一次，不冒泡到 backdrop）
  // ============================================================
  it('should call onClose exactly once when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    const closeBtn = document.body.querySelector('.remar-fs__close')!;
    act(() => {
      fireEvent.click(closeBtn);
    });

    // 关键断言：必须只调用一次（stopPropagation 防止冒泡到 backdrop）
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // Test 7: 滚动锁定
  // ============================================================
  it('should lock body scroll when open and unlock when closed', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Fullscreenable open={true} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Fullscreenable open={false} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await new Promise((r) => setTimeout(r, 250));

    expect(document.body.style.overflow).toBe('');
  });

  // ============================================================
  // Test 8: 主题继承
  // ============================================================
  it('should inherit data-theme from nearest remar container', async () => {
    const remarContainer = document.createElement('div');
    remarContainer.className = 'remar-md';
    remarContainer.setAttribute('data-theme', 'dark');
    document.body.appendChild(remarContainer);

    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
    });

    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('data-theme')).toBe('dark');
    expect(dialog.classList.contains('remar-container')).toBe(true);

    document.body.removeChild(remarContainer);
  });

  // ============================================================
  // Test 9: closeOnBackdropClick=false
  // ============================================================
  it('should NOT close on backdrop click when closeOnBackdropClick=false', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose} closeOnBackdropClick={false}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    const dialog = document.body.querySelector('[role="dialog"]')!;
    act(() => {
      fireEvent.click(dialog);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  // ============================================================
  // Test 10: closeOnEsc=false
  // ============================================================
  it('should NOT close on ESC when closeOnEsc=false', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose} closeOnEsc={false}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  // ============================================================
  // Test 11: 从 open 切换到 closed 时移除 Portal
  // ============================================================
  it('should remove Portal from DOM when open changes from true to false', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Fullscreenable open={true} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    rerender(
      <Fullscreenable open={false} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  // ============================================================
  // Test 12: 无障碍属性
  // ============================================================
  it('should have correct accessibility attributes', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose} ariaLabel="Test fullscreen">
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    });

    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Test fullscreen');

    const closeBtn = document.body.querySelector('.remar-fs__close')!;
    expect(closeBtn).toHaveAttribute('aria-label', 'Close fullscreen');
  });

  // ============================================================
  // Test 13: BEM CSS 类名正确
  // ============================================================
  it('should use correct BEM class names', async () => {
    const onClose = vi.fn();
    render(
      <Fullscreenable open={true} onClose={onClose}>
        <div>Content</div>
      </Fullscreenable>
    );

    await waitFor(() => {
      expect(document.body.querySelector('.remar-fs')).not.toBeNull();
    });

    expect(document.body.querySelector('.remar-fs')).toBeInTheDocument();
    expect(document.body.querySelector('.remar-fs__close')).toBeInTheDocument();
    expect(document.body.querySelector('.remar-fs__content')).toBeInTheDocument();
    expect(document.body.querySelector('.remar-fs__content--animate')).toBeInTheDocument();
  });
});
