;;; k-agenda-protocol-test.el --- ERT tests for k-agenda-protocol -*- lexical-binding: t; -*-

;; Run headless with:
;;   emacs -Q --batch -L . -l ert -l k-agenda-model.el -l k-agenda-protocol.el \
;;     -l k-agenda-protocol-test.el -f ert-run-tests-batch-and-exit

;;; Code:

(require 'ert)
(require 'k-agenda-protocol)

(ert-deftest k-agenda-test-type-for-matches-known-tag-case-insensitively ()
  "A tag matching one of the 5 known type names resolves to the
canonically-cased name, regardless of how the tag itself was typed."
  (should (equal (k-agenda-protocol--type-for (list :tags '("MEETING"))) "Meeting"))
  (should (equal (k-agenda-protocol--type-for (list :tags '("meeting"))) "Meeting"))
  (should (equal (k-agenda-protocol--type-for (list :tags '("Meeting"))) "Meeting"))
  (should (equal (k-agenda-protocol--type-for (list :tags '("IDEA"))) "Idea"))
  (should (equal (k-agenda-protocol--type-for (list :tags '("Task"))) "Task"))
  (should (equal (k-agenda-protocol--type-for (list :tags '("TODO"))) "TODO"))
  (should (equal (k-agenda-protocol--type-for (list :tags '("Diary"))) "Diary")))

(ert-deftest k-agenda-test-type-for-ignores-unrelated-tags ()
  "Tags that aren't one of the 5 known names never leak into Type, and
:todo-state is never consulted as a fallback."
  (should (null (k-agenda-protocol--type-for (list :tags '("project_x" "urgent")))))
  (should (null (k-agenda-protocol--type-for (list :tags nil :todo-state "DONE"))))
  (should (null (k-agenda-protocol--type-for (list :tags '("interview" "grab") :todo-state "NEXT")))))

(ert-deftest k-agenda-test-type-for-picks-first-known-match-in-fixed-order ()
  "When multiple known-type tags are present (unusual, but possible), the
first match in `k-agenda-protocol--known-types' order wins,
deterministically -- \"Idea\" before \"Task\" in that list, regardless of
the order the tags themselves appear in."
  (should (equal (k-agenda-protocol--type-for (list :tags '("Task" "Idea"))) "Idea")))

(provide 'k-agenda-protocol-test)
;;; k-agenda-protocol-test.el ends here
