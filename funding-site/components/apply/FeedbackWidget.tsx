"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, LoaderCircle, Star } from "lucide-react";
import { useState } from "react";
import { FEEDBACK_COMMENT_MAX } from "@/lib/validation";
import { cx, pillClass } from "../ui";

const LABELS = ["Very hard", "Hard", "OK", "Easy", "Very easy"];

type Status = "idle" | "saving" | "saved" | "error";

async function postFeedback(payload: { applicationId: string; rating: number; comment?: string }): Promise<boolean> {
  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * One-click rating. The click itself saves the rating; the comment box that
 * opens afterwards is optional and saves on Submit.
 */
export function FeedbackWidget({ applicationId }: { applicationId: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [ratingStatus, setRatingStatus] = useState<Status>("idle");
  const [comment, setComment] = useState("");
  const [commentStatus, setCommentStatus] = useState<Status>("idle");

  const rate = async (value: number) => {
    if (ratingStatus === "saving" || commentStatus === "saved") return;
    setRating(value);
    setRatingStatus("saving");
    setRatingStatus((await postFeedback({ applicationId, rating: value })) ? "saved" : "error");
  };

  const submitComment = async () => {
    if (!comment.trim() || commentStatus === "saving") return;
    setCommentStatus("saving");
    setCommentStatus((await postFeedback({ applicationId, rating, comment: comment.trim() })) ? "saved" : "error");
  };

  const shown = hover || rating;

  return (
    <section data-testid="feedback" aria-labelledby="feedback-title" className="mt-4 rounded-3xl bg-ink-50 p-6 sm:p-8">
      <h2 id="feedback-title" className="text-lg font-extrabold text-ink-950">
        How easy was our application process?
      </h2>

      <div
        role="radiogroup"
        aria-labelledby="feedback-title"
        className="mt-3 flex gap-1"
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(0);
        }}
      >
        {LABELS.map((label, i) => {
          const value = i + 1;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} out of 5: ${label}`}
              data-testid={`rate-${value}`}
              disabled={commentStatus === "saved"}
              // Preview stars for a mouse or keyboard only, so a tap can't leave a stale preview.
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setHover(value);
              }}
              onFocus={(e) => {
                if (e.target.matches(":focus-visible")) setHover(value);
              }}
              onBlur={() => setHover(0)}
              onClick={() => rate(value)}
              className="flex h-12 w-12 appearance-none items-center justify-center rounded-full transition-transform [-webkit-tap-highlight-color:transparent] hover:scale-110 disabled:hover:scale-100"
            >
              <Star
                className={cx("h-8 w-8 transition-colors", value <= shown ? "fill-amber-400 text-amber-500" : "text-ink-300")}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <p aria-live="polite" data-testid="rating-status" className="mt-1 min-h-5 text-sm text-ink-600">
        {ratingStatus === "saving" && "Saving…"}
        {ratingStatus === "saved" && `Thanks. Saved: ${rating} out of 5 (${LABELS[rating - 1]}).`}
        {ratingStatus === "error" && (
          <span className="font-medium text-red-700">
            That didn&apos;t save.{" "}
            <button type="button" className="underline" onClick={() => rate(rating)}>
              Try again
            </button>
          </span>
        )}
        {ratingStatus === "idle" && (shown ? LABELS[shown - 1] : "Tap a star. One click and you're done.")}
      </p>

      <AnimatePresence initial={false}>
        {ratingStatus === "saved" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            {commentStatus === "saved" ? (
              <p data-testid="comment-saved" role="status" className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-100 p-4 font-semibold text-brand-900">
                <CircleCheck className="h-5 w-5 shrink-0" aria-hidden="true" /> Saved. Thanks for telling us.
              </p>
            ) : (
              <div className="pt-4">
                <label htmlFor="feedback-comment" className="block text-sm font-bold text-ink-900">
                  Anything we could make clearer? <span className="font-normal text-ink-500">(optional)</span>
                </label>
                <textarea
                  id="feedback-comment"
                  data-testid="feedback-comment"
                  rows={3}
                  maxLength={FEEDBACK_COMMENT_MAX}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border-2 border-ink-200 bg-white p-3.5 text-base text-ink-950 outline-none focus:border-brand-600"
                />
                {commentStatus === "error" && (
                  <p role="alert" className="mt-1 text-sm font-medium text-red-700">
                    That didn&apos;t save. Please try again.
                  </p>
                )}
                <button
                  type="button"
                  data-testid="feedback-submit"
                  onClick={submitComment}
                  disabled={!comment.trim() || commentStatus === "saving"}
                  className={pillClass("primary", "sm", "mt-3")}
                >
                  {commentStatus === "saving" ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
                    </>
                  ) : (
                    "Submit"
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
