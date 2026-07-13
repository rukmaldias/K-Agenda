;;; k-agenda-protocol-test.el --- ERT tests for k-agenda-protocol -*- lexical-binding: t; -*-

;; Run headless with:
;;   emacs -Q --batch -L . -l ert -l k-agenda-model.el -l k-agenda-protocol.el \
;;     -l k-agenda-protocol-test.el -f ert-run-tests-batch-and-exit

;;; Code:

(require 'ert)
(require 'k-agenda-protocol)

(ert-deftest k-agenda-test-type-for-matches-capture-type-case-insensitively ()
  "A :CAPTURE_TYPE: value matching one of the 5 known types resolves to
the canonically-cased name, regardless of how it was typed."
  (should (equal (k-agenda-protocol--type-for (list :capture-type "Meeting")) "Meeting"))
  (should (equal (k-agenda-protocol--type-for (list :capture-type "MEETING")) "Meeting"))
  (should (equal (k-agenda-protocol--type-for (list :capture-type "meeting")) "Meeting"))
  (should (equal (k-agenda-protocol--type-for (list :capture-type "Idea")) "Idea"))
  (should (equal (k-agenda-protocol--type-for (list :capture-type "Task")) "Task"))
  (should (equal (k-agenda-protocol--type-for (list :capture-type "Todo")) "Todo"))
  (should (equal (k-agenda-protocol--type-for (list :capture-type "Diary")) "Diary")))

(ert-deftest k-agenda-test-type-for-blank-when-property-absent-or-unrecognized ()
  "No :CAPTURE_TYPE: property, or a value that isn't one of the 5 known
types, means no Type -- never guessed from :todo-state or anything else."
  (should (null (k-agenda-protocol--type-for (list :capture-type nil))))
  (should (null (k-agenda-protocol--type-for (list :capture-type nil :todo-state "DONE"))))
  (should (null (k-agenda-protocol--type-for (list :capture-type "SomeRandomValue"))))
  (should (null (k-agenda-protocol--type-for (list :capture-type "Next" :todo-state "NEXT")))))

(ert-deftest k-agenda-test-encode-snapshot-round-trips-multibyte-characters ()
  "Regression test: on a build with no libjansson linked, `json-serialize'
falls back to Emacs's pure-Lisp JSON implementation, which was found to
corrupt multibyte characters (an em dash came out as invalid UTF-8
bytes). `k-agenda-protocol-encode-snapshot' must use `json-encode'
instead, which round-trips correctly -- verified here by actually
parsing the output back and comparing, not just eyeballing bytes."
  ;; The bug reproduced even for a literal Lisp string with no file I/O
  ;; involved, so a literal em dash here is a faithful regression check.
  ;; Parsed with json-read-from-string (json.el), matching what encoded
  ;; it -- a cross-library round-trip could mask a bug in either side.
  (let* ((title "PyTorch — Learn the Basics")
         (round-tripped (json-read-from-string (json-encode title))))
    (should (equal round-tripped title))))

(ert-deftest k-agenda-test-reference-node-payload-nests-children-as-vectors ()
  "Each reference tree node's `children' field is a JSON vector (even
when empty), and nested children recurse the same shape."
  (let* ((leaf (list :id "leaf-id" :title "Leaf" :level 2 :tags '("foo") :children nil))
         (root (list :id "root-id" :title "Root" :level 1 :tags nil :children (list leaf)))
         (payload (k-agenda-protocol--reference-node-payload root)))
    (should (equal (cdr (assoc 'id payload)) "root-id"))
    (should (vectorp (cdr (assoc 'children payload))))
    (should (= (length (cdr (assoc 'children payload))) 1))
    (let ((leaf-payload (aref (cdr (assoc 'children payload)) 0)))
      (should (equal (cdr (assoc 'title leaf-payload)) "Leaf"))
      (should (vectorp (cdr (assoc 'tags leaf-payload))))
      (should (equal (aref (cdr (assoc 'tags leaf-payload)) 0) "foo"))
      (should (vectorp (cdr (assoc 'children leaf-payload))))
      (should (= (length (cdr (assoc 'children leaf-payload))) 0)))))

(provide 'k-agenda-protocol-test)
;;; k-agenda-protocol-test.el ends here
