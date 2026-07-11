;;; k-agenda-workflow-test.el --- ERT tests for k-agenda-workflow -*- lexical-binding: t; -*-

;; Run headless with:
;;   emacs -Q --batch -L . -l ert -l k-agenda-workflow.el -l k-agenda-workflow-test.el \
;;     -f ert-run-tests-batch-and-exit

;;; Code:

(require 'ert)
(require 'k-agenda-workflow)

(ert-deftest k-agenda-test-workflow-same-state-is-always-valid ()
  "A no-op drop (same column) is always valid, for any state."
  (dolist (s '("TODO" "NEXT" "WAITING" "INACTIVE" "MEETING" "DONE" "CANCELLED"))
    (should (k-agenda-workflow-valid-p s s))))

(ert-deftest k-agenda-test-workflow-every-diagrammed-transition-is-valid ()
  "Every transition from the user's \"makes perfect sense\" list validates."
  (dolist (pair '(("INACTIVE" . "TODO")
                  ("TODO" . "NEXT")
                  ("NEXT" . "WAITING")
                  ("WAITING" . "TODO")
                  ("WAITING" . "NEXT")
                  ("NEXT" . "DONE")
                  ("TODO" . "DONE")
                  ("MEETING" . "DONE")
                  ("TODO" . "CANCELLED")
                  ("NEXT" . "CANCELLED")
                  ("WAITING" . "CANCELLED")
                  ("INACTIVE" . "CANCELLED")
                  ("MEETING" . "CANCELLED")))
    (should (k-agenda-workflow-valid-p (car pair) (cdr pair)))))

(ert-deftest k-agenda-test-workflow-every-named-anti-pattern-is-rejected-with-its-own-message ()
  "Each transition the user explicitly called an anti-pattern is
rejected, with the specific reasoning (not the generic fallback)."
  (dolist (pair '(("NEXT" . "INACTIVE")
                  ("DONE" . "WAITING")
                  ("CANCELLED" . "DONE")
                  ("TODO" . "MEETING")
                  ("NEXT" . "MEETING")
                  ("MEETING" . "TODO")
                  ("MEETING" . "NEXT")))
    (should-not (k-agenda-workflow-valid-p (car pair) (cdr pair)))
    (let ((msg (k-agenda-workflow-rejection-message (car pair) (cdr pair))))
      (should msg)
      (should-not (string-suffix-p "isn't part of the standard workflow." msg)))))

(ert-deftest k-agenda-test-workflow-unlisted-transition-gets-generic-message ()
  "A transition that's neither in the valid list nor explicitly named as
an anti-pattern is still rejected, with a generic explanation."
  (should-not (k-agenda-workflow-valid-p "TODO" "INACTIVE"))
  (should (string-suffix-p "isn't part of the standard workflow."
                           (k-agenda-workflow-rejection-message "TODO" "INACTIVE"))))

(ert-deftest k-agenda-test-workflow-generic-message-humanizes-done ()
  "The generic fallback message uses \"Completed\", not the raw \"DONE\"
keyword, matching every other label in the UI."
  (should (string-match-p "Completed"
                          (k-agenda-workflow-rejection-message "DONE" "TODO"))))

(provide 'k-agenda-workflow-test)
;;; k-agenda-workflow-test.el ends here
