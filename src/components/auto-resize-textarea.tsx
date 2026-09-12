"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type TextareaHTMLAttributes,
} from "react";

type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  maxRows?: number;
};

export const AutoResizeTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(function AutoResizeTextarea(
  { className = "", maxRows = 9, onInput, style, value, ...props },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);

  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || textarea.offsetParent === null) return;

    const computed = window.getComputedStyle(textarea);
    const parsedLineHeight = Number.parseFloat(computed.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight)
      ? parsedLineHeight
      : Number.parseFloat(computed.fontSize) * 1.5;
    const padding = Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom);
    const border = Number.parseFloat(computed.borderTopWidth) + Number.parseFloat(computed.borderBottomWidth);
    const oneLineHeight = lineHeight + padding + border;
    const maxHeight = lineHeight * maxRows + padding + border;

    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight + border, oneLineHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight + border > maxHeight ? "auto" : "hidden";
  }, [maxRows]);

  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const form = textarea.form;
    const handleReset = () => requestAnimationFrame(resize);
    const observer = new ResizeObserver(resize);

    observer.observe(textarea);
    form?.addEventListener("reset", handleReset);
    return () => {
      observer.disconnect();
      form?.removeEventListener("reset", handleReset);
    };
  }, [resize]);

  const textareaStyle: CSSProperties = {
    ...style,
    resize: "none",
    overflowY: "hidden",
  };

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      value={value}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      style={textareaStyle}
      className={className}
    />
  );
});
