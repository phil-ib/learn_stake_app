;; Blockchain Learning Management System with Staking
;; A decentralized LMS where students stake STX to enroll in courses and earn rewards upon completion

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-already-exists (err u103))
(define-constant err-insufficient-stake (err u104))
(define-constant err-already-enrolled (err u105))
(define-constant err-not-enrolled (err u106))
(define-constant err-course-not-active (err u107))
(define-constant err-already-completed (err u108))
(define-constant err-insufficient-progress (err u109))
(define-constant err-transfer-failed (err u110))

;; Data Variables
(define-data-var next-course-id uint u1)
(define-data-var platform-fee-percentage uint u5) ;; 5% platform fee

;; Data Maps
;; Course data structure
(define-map courses
  { course-id: uint }
  {
    instructor: principal,
    title: (string-ascii 100),
    description: (string-ascii 500),
    stake-amount: uint,
    reward-amount: uint,
    duration-blocks: uint,
    min-completion-percentage: uint,
    is-active: bool,
    total-enrolled: uint,
    total-completed: uint,
    created-at: uint
  })

;; Student enrollment tracking
(define-map enrollments
  { student: principal, course-id: uint }
  {
    enrolled-at: uint,
    stake-paid: uint,
    progress-percentage: uint,
    is-completed: bool,
    completed-at: (optional uint),
    milestones-completed: (list 20 uint)
  })

;; Course milestones (assignments/lessons)
(define-map course-milestones
  { course-id: uint, milestone-id: uint }
  {
    title: (string-ascii 100),
    description: (string-ascii 300),
    points: uint,
    is-required: bool
  })

;; Student milestone completions
(define-map milestone-completions
  { student: principal, course-id: uint, milestone-id: uint }
  { completed-at: uint, points-earned: uint })

;; Instructor profiles
(define-map instructors
  { instructor: principal }
  {
    name: (string-ascii 50),
    bio: (string-ascii 300),
    total-courses: uint,
    total-students: uint,
    rating: uint
  })

;; Private Functions

;; Calculate platform fee
(define-private (calculate-platform-fee (amount uint))
  (/ (* amount (var-get platform-fee-percentage)) u100))

;; Calculate instructor reward from failed stakes
(define-private (calculate-instructor-reward (stake-amount uint))
  (- stake-amount (calculate-platform-fee stake-amount)))

;; Validate course exists and is active
(define-private (validate-active-course (course-id uint))
  (match (map-get? courses { course-id: course-id })
    course-data (if (get is-active course-data)
                   (ok course-data)
                   err-course-not-active)
    err-not-found))

;; Public Functions

;; Initialize instructor profile
(define-public (register-instructor (name (string-ascii 50)) (bio (string-ascii 300)))
  (ok (map-set instructors
    { instructor: tx-sender }
    {
      name: name,
      bio: bio,
      total-courses: u0,
      total-students: u0,
      rating: u5 ;; Default 5/10 rating
    })))

;; Create a new course
(define-public (create-course 
  (title (string-ascii 100))
  (description (string-ascii 500))
  (stake-amount uint)
  (reward-amount uint)
  (duration-blocks uint)
  (min-completion-percentage uint))
  (let ((course-id (var-get next-course-id)))
    (asserts! (> stake-amount u0) err-insufficient-stake)
    (asserts! (> reward-amount u0) (err u111))
    (asserts! (<= min-completion-percentage u100) (err u112))
    
    ;; Create the course
    (map-set courses
      { course-id: course-id }
      {
        instructor: tx-sender,
        title: title,
        description: description,
        stake-amount: stake-amount,
        reward-amount: reward-amount,
        duration-blocks: duration-blocks,
        min-completion-percentage: min-completion-percentage,
        is-active: true,
        total-enrolled: u0,
        total-completed: u0,
        created-at: block-height
      })
    
    ;; Update instructor stats
    (match (map-get? instructors { instructor: tx-sender })
      instructor-data (map-set instructors
                        { instructor: tx-sender }
                        (merge instructor-data { total-courses: (+ (get total-courses instructor-data) u1) }))
      true) ;; If no instructor profile, that's OK
    
    ;; Increment next course ID
    (var-set next-course-id (+ course-id u1))
    (ok course-id)))

;; Add milestone to a course
(define-public (add-milestone 
  (course-id uint)
  (milestone-id uint)
  (title (string-ascii 100))
  (description (string-ascii 300))
  (points uint)
  (is-required bool))
  (match (map-get? courses { course-id: course-id })
    course-data 
      (begin
        (asserts! (is-eq (get instructor course-data) tx-sender) err-unauthorized)
        (map-set course-milestones
          { course-id: course-id, milestone-id: milestone-id }
          {
            title: title,
            description: description,
            points: points,
            is-required: is-required
          })
        (ok true))
    err-not-found))

;; Student enrolls in course by staking STX
(define-public (enroll-in-course (course-id uint))
  (match (validate-active-course course-id)
    course-data
      (let ((stake-amount (get stake-amount course-data)))
        ;; Check if already enrolled
        (asserts! (is-none (map-get? enrollments { student: tx-sender, course-id: course-id })) 
                  err-already-enrolled)
        
        ;; Transfer stake from student to contract
        (match (stx-transfer? stake-amount tx-sender (as-contract tx-sender))
          success
            (begin
              ;; Record enrollment
              (map-set enrollments
                { student: tx-sender, course-id: course-id }
                {
                  enrolled-at: block-height,
                  stake-paid: stake-amount,
                  progress-percentage: u0,
                  is-completed: false,
                  completed-at: none,
                  milestones-completed: (list)
                })
              
              ;; Update course stats
              (map-set courses
                { course-id: course-id }
                (merge course-data { total-enrolled: (+ (get total-enrolled course-data) u1) }))
              
              ;; Update instructor stats
              (match (map-get? instructors { instructor: (get instructor course-data) })
                instructor-data 
                  (map-set instructors
                    { instructor: (get instructor course-data) }
                    (merge instructor-data { total-students: (+ (get total-students instructor-data) u1) }))
                true)
              
              (ok true))
          error err-transfer-failed))
    error error))

;; Complete a milestone
(define-public (complete-milestone (course-id uint) (milestone-id uint))
  (match (map-get? enrollments { student: tx-sender, course-id: course-id })
    enrollment-data
      (match (map-get? course-milestones { course-id: course-id, milestone-id: milestone-id })
        milestone-data
          (begin
            (asserts! (not (get is-completed enrollment-data)) err-already-completed)
            
            ;; Record milestone completion
            (map-set milestone-completions
              { student: tx-sender, course-id: course-id, milestone-id: milestone-id }
              {
                completed-at: block-height,
                points-earned: (get points milestone-data)
              })
            
            ;; Update enrollment with new milestone
            (let ((updated-milestones (unwrap! (as-max-len? 
                                               (append (get milestones-completed enrollment-data) milestone-id) 
                                               u20) 
                                               (err u113))))
              (map-set enrollments
                { student: tx-sender, course-id: course-id }
                (merge enrollment-data { milestones-completed: updated-milestones }))
              
              (ok true)))
        err-not-found)
    err-not-enrolled))

;; Update progress percentage manually (for instructors)
(define-public (update-student-progress (student principal) (course-id uint) (progress uint))
  (match (map-get? courses { course-id: course-id })
    course-data
      (begin
        (asserts! (is-eq (get instructor course-data) tx-sender) err-unauthorized)
        (asserts! (<= progress u100) (err u114))
        
        (match (map-get? enrollments { student: student, course-id: course-id })
          enrollment-data
            (begin
              (map-set enrollments
                { student: student, course-id: course-id }
                (merge enrollment-data { progress-percentage: progress }))
              (ok true))
          err-not-enrolled))
    err-not-found))

;; Complete course and claim rewards
(define-public (complete-course (course-id uint))
  (match (map-get? courses { course-id: course-id })
    course-data
      (match (map-get? enrollments { student: tx-sender, course-id: course-id })
        enrollment-data
          (begin
            (asserts! (not (get is-completed enrollment-data)) err-already-completed)
            (asserts! (>= (get progress-percentage enrollment-data) 
                         (get min-completion-percentage course-data)) 
                     err-insufficient-progress)
            
            ;; Mark as completed
            (map-set enrollments
              { student: tx-sender, course-id: course-id }
              (merge enrollment-data { 
                is-completed: true,
                completed-at: (some block-height)
              }))
            
            ;; Update course completion stats
            (map-set courses
              { course-id: course-id }
              (merge course-data { total-completed: (+ (get total-completed course-data) u1) }))
            
            ;; Return stake + reward to student
            (let ((total-reward (+ (get stake-paid enrollment-data) (get reward-amount course-data))))
              (match (as-contract (stx-transfer? total-reward tx-sender tx-sender))
                success (ok true)
                error err-transfer-failed)))
        err-not-enrolled)
    err-not-found))

;; Instructor can claim failed stakes after course duration
(define-public (claim-failed-stakes (course-id uint))
  (match (map-get? courses { course-id: course-id })
    course-data
      (begin
        (asserts! (is-eq (get instructor course-data) tx-sender) err-unauthorized)
        (asserts! (> block-height (+ (get created-at course-data) (get duration-blocks course-data))) 
                 (err u115))
        
        ;; This is a simplified version - in reality, you'd iterate through all enrollments
        ;; and calculate total failed stakes
        (ok true))
    err-not-found))

;; Read-only functions

;; Get course details
(define-read-only (get-course (course-id uint))
  (map-get? courses { course-id: course-id }))

;; Get enrollment details
(define-read-only (get-enrollment (student principal) (course-id uint))
  (map-get? enrollments { student: student, course-id: course-id }))

;; Get instructor profile
(define-read-only (get-instructor (instructor principal))
  (map-get? instructors { instructor: instructor }))

;; Get milestone details
(define-read-only (get-milestone (course-id uint) (milestone-id uint))
  (map-get? course-milestones { course-id: course-id, milestone-id: milestone-id }))

;; Get current course ID counter
(define-read-only (get-next-course-id)
  (var-get next-course-id))

;; Admin functions (contract owner only)

;; Toggle course active status
(define-public (toggle-course-status (course-id uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (match (map-get? courses { course-id: course-id })
      course-data
        (begin
          (map-set courses
            { course-id: course-id }
            (merge course-data { is-active: (not (get is-active course-data)) }))
          (ok true))
      err-not-found)))

;; Update platform fee
(define-public (set-platform-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (<= new-fee u20) (err u116)) ;; Max 20% fee
    (var-set platform-fee-percentage new-fee)
    (ok true)))
