;;; k-agenda-model-test.el --- ERT tests for k-agenda-model -*- lexical-binding: t; -*-

;; Run headless with:
;;   emacs -Q --batch -L . -l ert -l k-agenda-model.el -l k-agenda-model-test.el \
;;     -f ert-run-tests-batch-and-exit

;;; Code:

(require 'ert)
(require 'k-agenda-model)

(defvar k-agenda-test--todo-keywords
  '((sequence "TODO(t)" "NEXT(n)" "WAITING(w@)" "INACTIVE(i)" "MEETING(m)"
              "|" "DONE(d)" "CANCELLED(c@)")))

(defmacro k-agenda-test-with-fixture-files (bindings &rest body)
  "Write each (VAR . CONTENT) in BINDINGS to a temp .org file bound to VAR,
set `org-agenda-files' to all of them, and run BODY with `org-todo-keywords'
set to the user's real GTD sequence. Files are deleted afterwards."
  (declare (indent 1))
  (let ((var-syms (mapcar #'car bindings)))
    `(let* (,@(mapcar (lambda (b)
                         `(,(car b) (make-temp-file "k-agenda-test-" nil ".org" ,(cadr b))))
                       bindings)
            (org-agenda-files (list ,@var-syms))
            (org-todo-keywords k-agenda-test--todo-keywords)
            (org-todo-keyword-faces nil))
       (unwind-protect
           (progn ,@body)
         (dolist (f (list ,@var-syms))
           (let ((buf (find-buffer-visiting f)))
             (when buf (kill-buffer buf)))
           (delete-file f))))))

(ert-deftest k-agenda-test-orphan-file-falls-back-to-file-project ()
  "A file with only a sub-level heading (no level-1 parent) buckets under
the capitalized file basename, matching the real `inbox.org' case."
  (k-agenda-test-with-fixture-files
      ((inbox "** DONE with Some Developer.. :MEETING:\nSCHEDULED: <2026-07-02 Thu 17:30>\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (entry (car entries))
           (base (file-name-base inbox))
           (expected-project (concat (upcase (substring base 0 1)) (substring base 1))))
      (should (= (length entries) 1))
      (should (equal (plist-get entry :todo-state) "DONE"))
      (should (equal (plist-get entry :project) expected-project)))))

(ert-deftest k-agenda-test-todo-less-level1-anchor-is-not-a-task ()
  "A level-1 heading with no TODO keyword is a project anchor: it appears
as a project bucket but does not count toward that project's task total."
  (k-agenda-test-with-fixture-files
      ((projects "* Project X Board                    :project_x:\n\n** TODO Fix the thing\n\n** DONE Ship the thing\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (stats (k-agenda-model-project-stats entries))
           (bucket (car stats)))
      (should (= (length entries) 3))
      (should (null (plist-get (car entries) :todo-state)))
      (should (equal (plist-get bucket :name) "Project X Board"))
      (should (= (plist-get bucket :total) 2))
      (should (= (plist-get bucket :done) 1)))))

(ert-deftest k-agenda-test-irregular-whitespace-before-keyword ()
  "Extra whitespace between the outline stars and the TODO keyword (as
literally found in the real projects.org) must not break state parsing."
  (k-agenda-test-with-fixture-files
      ((projects "* Project X Board\n\n**  TODO Documentation of project-x\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (task (cl-find "TODO" entries :key (lambda (e) (plist-get e :todo-state)) :test #'equal)))
      (should task)
      (should (equal (plist-get task :title) "Documentation of project-x"))
      (should (equal (plist-get task :project) "Project X Board")))))

(ert-deftest k-agenda-test-cancelled-excluded-from-project-percent ()
  "CANCELLED tasks are removed scope: excluded from both the numerator and
denominator of a project's percent-done."
  (k-agenda-test-with-fixture-files
      ((projects "* Project X Board\n\n** DONE Task A\n\n** CANCELLED Task B\n\n** TODO Task C\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (bucket (car (k-agenda-model-project-stats entries))))
      ;; total task count includes CANCELLED (3), but percent = done / (total - cancelled) = 1/2 = 50%
      (should (= (plist-get bucket :total) 3))
      (should (= (plist-get bucket :cancelled) 1))
      (should (= (plist-get bucket :percent) 50)))))

(ert-deftest k-agenda-test-state-counts-and-total-projects-multi-file ()
  "Cross-file aggregation: state counts sum across files, project buckets
are counted per distinct project name."
  (k-agenda-test-with-fixture-files
      ((projects "* Project X Board\n\n** TODO Task A\n\n** NEXT Task B\n")
       (learning "* Learning\n\n** TODO Study Go\n"))
    (let ((entries (k-agenda-model-collect-entries)))
      (should (= (k-agenda-model-total-projects entries) 2))
      (should (equal (sort (copy-sequence (k-agenda-model-state-counts entries))
                            (lambda (a b) (string< (car a) (car b))))
                      '(("NEXT" . 1) ("TODO" . 2)))))))

(provide 'k-agenda-model-test)
;;; k-agenda-model-test.el ends here
