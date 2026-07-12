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
set `org-agenda-files' to those files directly (a plain file entry, not a
directory), and run BODY with the user's real GTD keyword sequence.
Since none of these files is a directory entry, none of them is a
\"project file\" -- every entry's `:project' resolves to nil here; use
`k-agenda-test--call-with-project-dir' for project-derivation tests.
Files are deleted afterwards."
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

(defun k-agenda-test--make-project-dir (file-specs)
  "Create a temp directory containing FILE-SPECS (alist of relative
filename . content) and return its path."
  (let ((dir (make-temp-file "k-agenda-test-dir-" t)))
    (dolist (f file-specs)
      (with-temp-file (expand-file-name (car f) dir)
        (insert (cdr f))))
    dir))

(defun k-agenda-test--cleanup-project-dir (dir)
  (dolist (f (directory-files dir t "\\.org\\'"))
    (let ((buf (find-buffer-visiting f)))
      (when buf (kill-buffer buf))))
  (delete-directory dir t))

(defun k-agenda-test--call-with-project-dir (file-specs thunk)
  "Create a project directory (see `k-agenda-test--make-project-dir') from
FILE-SPECS, set `org-agenda-files' to just that directory (a directory
entry -- every file inside becomes a \"project file\"), call THUNK with
the directory path, then clean up."
  (let* ((dir (k-agenda-test--make-project-dir file-specs))
         (org-agenda-files (list dir))
         (org-todo-keywords k-agenda-test--todo-keywords)
         (org-todo-keyword-faces nil))
    (unwind-protect
        (funcall thunk dir)
      (k-agenda-test--cleanup-project-dir dir))))

(ert-deftest k-agenda-test-flat-file-entries-have-no-project ()
  "A plain file entry in `org-agenda-files' (not a directory) never
contributes a project, even for a level-1 heading -- matching the real
inbox.org/work.org/learning.org, which just hold untethered tasks."
  (k-agenda-test-with-fixture-files
      ((inbox "* Some level-1 heading\n\n** TODO Fix the thing\n")
       (loose "** DONE with Some Developer.. :MEETING:\nSCHEDULED: <2026-07-02 Thu 17:30>\n"))
    (let ((entries (k-agenda-model-collect-entries)))
      (should (= (length entries) 3))
      (dolist (e entries)
        (should (null (plist-get e :project))))
      (should (= (k-agenda-model-total-projects entries) 0)))))

(ert-deftest k-agenda-test-project-file-uses-title-keyword-when-present ()
  "A project file's `#+TITLE:' wins over its heading text as the project
name -- matching the real gen_ai_learning.org (#+TITLE: GenAI Career
Study Plan, heading text \"Gen-AI Learning\")."
  (k-agenda-test--call-with-project-dir
   '(("gen_ai.org" . "#+TITLE: GenAI Career Study Plan\n\n* Gen-AI Learning\n\n** TODO Read a paper\n"))
   (lambda (_dir)
     (let* ((entries (k-agenda-model-collect-entries))
            (task (cl-find "Read a paper" entries
                            :key (lambda (e) (plist-get e :title)) :test #'equal)))
       (should task)
       (should (equal (plist-get task :project) "GenAI Career Study Plan"))))))

(ert-deftest k-agenda-test-project-file-title-strips-stray-trailing-tag ()
  "A `#+TITLE:' line with a stray trailing tag group (as literally found
in the real project_x.org -- `#+TITLE: Project X    :project_x:', likely
from org-set-tags-command firing on the wrong line) has that tag group
stripped -- #+TITLE is a keyword line, not a heading, so tags there are
never meaningful syntax, only noise."
  (k-agenda-test--call-with-project-dir
   '(("project_x.org" . "#+TITLE: Project X                                                 :project_x:\n\n* Project_X                                                       :project_x:\n\n** TODO Fix Jenkins\n"))
   (lambda (_dir)
     (let* ((entries (k-agenda-model-collect-entries))
            (task (cl-find "Fix Jenkins" entries
                            :key (lambda (e) (plist-get e :title)) :test #'equal)))
       (should task)
       (should (equal (plist-get task :project) "Project X"))))))

(ert-deftest k-agenda-test-project-file-falls-back-to-heading-without-title ()
  "A project file with no `#+TITLE:' uses its level-1 heading text --
matching the real project_x.org."
  (k-agenda-test--call-with-project-dir
   '(("project_x.org" . "* Project X\n\n** TODO Fix Jenkins\n"))
   (lambda (_dir)
     (let* ((entries (k-agenda-model-collect-entries))
            (task (cl-find "Fix Jenkins" entries
                            :key (lambda (e) (plist-get e :title)) :test #'equal)))
       (should task)
       (should (equal (plist-get task :project) "Project X"))))))

(ert-deftest k-agenda-test-project-match-is-case-insensitive-when-fs-is ()
  "Regression test: on Windows (and default macOS), the same file's path
can resolve with a different drive-letter/segment casing depending on
how it was opened (`c:/Users/...' via the minibuffer vs `C:/Users/...'
as written in `org-agenda-files'), even though the file system treats
them as identical. This is what silently dropped the project name for
a real project file -- the file itself was in the right directory, the
comparison just never matched, without ever raising an error."
  (cl-letf (((symbol-function 'file-name-case-insensitive-p) (lambda (_) t)))
    (should (k-agenda-model--file-name-equal-p
             "c:/Users/HP/Documents/Org/organizer/projects/x.org"
             "C:/Users/HP/Documents/Org/organizer/projects/x.org"))))

(ert-deftest k-agenda-test-project-match-respects-case-sensitive-fs ()
  "On a case-sensitive file system, differently-cased paths are genuinely
different files and must not be treated as a match."
  (cl-letf (((symbol-function 'file-name-case-insensitive-p) (lambda (_) nil)))
    (should-not (k-agenda-model--file-name-equal-p "/tmp/A.org" "/tmp/a.org"))))

(ert-deftest k-agenda-test-multiple-files-in-project-dir-are-separate-projects ()
  "Each file inside the projects/ directory is its own project bucket --
adding a new project = adding a new file, per the user's own
agenda-config.el spec."
  (k-agenda-test--call-with-project-dir
   '(("a.org" . "* Project A\n\n** TODO Task A1\n")
     ("b.org" . "* Project B\n\n** TODO Task B1\n\n** DONE Task B2\n"))
   (lambda (_dir)
     (let ((entries (k-agenda-model-collect-entries)))
       (should (= (k-agenda-model-total-projects entries) 2))
       (should (equal (sort (mapcar (lambda (p) (plist-get p :name))
                                     (k-agenda-model-project-stats entries))
                             #'string<)
                      '("Project A" "Project B")))))))

(ert-deftest k-agenda-test-todo-less-level1-anchor-is-not-a-task ()
  "A level-1 heading with no TODO keyword is a project anchor: it appears
as a project bucket but does not count toward that project's task total."
  (k-agenda-test--call-with-project-dir
   '(("project_x.org" . "* Project X Board                    :project_x:\n\n** TODO Fix the thing\n\n** DONE Ship the thing\n"))
   (lambda (_dir)
     (let* ((entries (k-agenda-model-collect-entries))
            (stats (k-agenda-model-project-stats entries))
            (bucket (car stats)))
       (should (= (length entries) 3))
       (should (null (plist-get (car entries) :todo-state)))
       (should (equal (plist-get bucket :name) "Project X Board"))
       (should (= (plist-get bucket :total) 2))
       (should (= (plist-get bucket :done) 1))))))

(ert-deftest k-agenda-test-irregular-whitespace-before-keyword ()
  "Extra whitespace between the outline stars and the TODO keyword (as
literally found in the real projects.org) must not break state parsing."
  (k-agenda-test--call-with-project-dir
   '(("project_x.org" . "* Project X Board\n\n**  TODO Documentation of project-x\n"))
   (lambda (_dir)
     (let* ((entries (k-agenda-model-collect-entries))
            (task (cl-find "TODO" entries :key (lambda (e) (plist-get e :todo-state)) :test #'equal)))
       (should task)
       (should (equal (plist-get task :title) "Documentation of project-x"))
       (should (equal (plist-get task :project) "Project X Board"))))))

(ert-deftest k-agenda-test-cancelled-excluded-from-project-percent ()
  "CANCELLED tasks are removed scope: excluded from both the numerator and
denominator of a project's percent-done."
  (k-agenda-test--call-with-project-dir
   '(("project_x.org" . "* Project X Board\n\n** DONE Task A\n\n** CANCELLED Task B\n\n** TODO Task C\n"))
   (lambda (_dir)
     (let* ((entries (k-agenda-model-collect-entries))
            (bucket (car (k-agenda-model-project-stats entries))))
       ;; total task count includes CANCELLED (3), but percent = done / (total - cancelled) = 1/2 = 50%
       (should (= (plist-get bucket :total) 3))
       (should (= (plist-get bucket :cancelled) 1))
       (should (= (plist-get bucket :percent) 50))))))

(ert-deftest k-agenda-test-state-counts-span-project-and-non-project-files ()
  "State counts (unlike project stats) aren't gated on being in a project
file -- a TODO in inbox.org counts the same as one in a project file."
  (k-agenda-test-with-fixture-files
      ((loose "* Learning\n\n** TODO Study Go\n"))
    (let ((entries (k-agenda-model-collect-entries)))
      (should (equal (plist-get (car entries) :project) nil))
      (should (equal (k-agenda-model-state-counts entries) '(("TODO" . 1)))))))

(ert-deftest k-agenda-test-tagged-heading-with-no-todo-state-is-parsed ()
  "A heading with no TODO keyword at all (e.g. a Diary/Idea capture) is
still parsed, with :todo-state nil -- Type resolution itself is
k-agenda-protocol.el's job (from :CAPTURE_TYPE:), tested there."
  (k-agenda-test-with-fixture-files
      ((diary "* Some heading\n\n** Wrote a journal entry\n:PROPERTIES:\n:CAPTURE_TYPE: Diary\n:END:\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (entry (cl-find "Wrote a journal entry" entries
                            :key (lambda (e) (plist-get e :title)) :test #'equal)))
      (should entry)
      (should (null (plist-get entry :todo-state)))
      (should (equal (plist-get entry :capture-type) "Diary")))))

(ert-deftest k-agenda-test-body-for-id-strips-planning-properties-logbook ()
  "The extracted body excludes the DEADLINE planning line, the property
drawer, and a LOGBOOK drawer -- only the free text remains."
  (k-agenda-test-with-fixture-files
      ((project_x "* Project X\n\n** TODO Fix Jenkins docker socket GID issue\nDEADLINE: <2026-07-11 Sat>\n:PROPERTIES:\n:CAPTURE_TYPE: Task\n:END:\n:LOGBOOK:\nCLOCK: [2026-07-10 Fri 10:00]--[2026-07-10 Fri 10:30] =>  0:30\n:END:\nThis is the real body text.\n\nA second paragraph.\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (task (cl-find "Fix Jenkins docker socket GID issue" entries
                           :key (lambda (e) (plist-get e :title)) :test #'equal))
           (body (k-agenda-model-body-for-id (plist-get task :id))))
      (should body)
      (should (equal body "This is the real body text.\n\nA second paragraph."))
      (should-not (string-match-p "DEADLINE" body))
      (should-not (string-match-p "PROPERTIES" body))
      (should-not (string-match-p "LOGBOOK" body)))))

(ert-deftest k-agenda-test-body-for-id-strips-planning-line-out-of-order ()
  "Regression test: the real project_x.org has the property drawer BEFORE
the DEADLINE planning line (non-standard order) -- `org-end-of-meta-data'
only recognizes a planning line immediately after the heading, before
any drawer, so it left DEADLINE in the body until this was fixed."
  (k-agenda-test-with-fixture-files
      ((project_x "* Project X\n\n** TODO Fix Jenkins docker socket GID issue\n:PROPERTIES:\n:CAPTURE_TYPE: Task\n:END:\nDEADLINE: <2026-07-11 Sat>\n\nThis is the real body text.\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (task (cl-find "Fix Jenkins docker socket GID issue" entries
                           :key (lambda (e) (plist-get e :title)) :test #'equal))
           (body (k-agenda-model-body-for-id (plist-get task :id))))
      (should (equal body "This is the real body text.")))))

(ert-deftest k-agenda-test-body-for-id-stops-before-child-heading ()
  "The body includes only this entry's own free text, not a child
heading's content."
  (k-agenda-test-with-fixture-files
      ((project "* Project\n\n** TODO Parent task\nParent's own text.\n\n*** TODO Child task\nChild's own text.\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (parent (cl-find "Parent task" entries
                             :key (lambda (e) (plist-get e :title)) :test #'equal))
           (body (k-agenda-model-body-for-id (plist-get parent :id))))
      (should (equal body "Parent's own text."))
      (should-not (string-match-p "Child" body)))))

(ert-deftest k-agenda-test-body-for-id-nil-when-not-found ()
  "An id that doesn't match any current entry (stale snapshot, or a
heading that's since been deleted) resolves to nil, not an error."
  (k-agenda-test-with-fixture-files
      ((project "* Project\n\n** TODO Some task\n"))
    (should (null (k-agenda-model-body-for-id "not-a-real-id")))))

(ert-deftest k-agenda-test-change-state-succeeds-and-persists-to-disk ()
  "A matching id + correct fromState changes the heading's TODO keyword
via `org-todo' and saves the buffer -- verified by re-reading the raw
file content from disk, not just in-memory buffer state."
  (k-agenda-test-with-fixture-files
      ((project "* Project\n\n** TODO Some task\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (task (cl-find "Some task" entries
                           :key (lambda (e) (plist-get e :title)) :test #'equal))
           (result (k-agenda-model-change-state (plist-get task :id) "TODO" "NEXT")))
      (should (plist-get result :ok))
      (with-temp-buffer
        (insert-file-contents project)
        (should (string-match-p "^\\*\\* NEXT Some task" (buffer-string)))))))

(ert-deftest k-agenda-test-change-state-refuses-when-state-is-stale ()
  "If the entry's CURRENT state doesn't match the caller's believed
fromState (someone else changed it since the snapshot was taken, or a
hash-based id drifted), the write is refused rather than blindly
applied, and nothing is written to disk."
  (k-agenda-test-with-fixture-files
      ((project "* Project\n\n** WAITING Some task\n"))
    (let* ((entries (k-agenda-model-collect-entries))
           (task (cl-find "Some task" entries
                           :key (lambda (e) (plist-get e :title)) :test #'equal))
           ;; Caller believes it's TODO, but it's actually WAITING.
           (result (k-agenda-model-change-state (plist-get task :id) "TODO" "NEXT")))
      (should-not (plist-get result :ok))
      (should (equal (plist-get result :reason) "stale"))
      (should (equal (plist-get result :current-state) "WAITING"))
      (with-temp-buffer
        (insert-file-contents project)
        (should (string-match-p "^\\*\\* WAITING Some task" (buffer-string)))))))

(ert-deftest k-agenda-test-change-state-not-found-for-unknown-id ()
  "An id that doesn't resolve to any current entry fails cleanly."
  (k-agenda-test-with-fixture-files
      ((project "* Project\n\n** TODO Some task\n"))
    (let ((result (k-agenda-model-change-state "not-a-real-id" "TODO" "NEXT")))
      (should-not (plist-get result :ok))
      (should (equal (plist-get result :reason) "not-found")))))

(provide 'k-agenda-model-test)
;;; k-agenda-model-test.el ends here
