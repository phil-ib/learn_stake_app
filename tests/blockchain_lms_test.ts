
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

const CONTRACT_NAME = 'blockchain_lms';

Clarinet.test({
    name: "Instructor can register and create a course",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const instructor = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            // Register instructor
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("John Doe"),
                types.ascii("Experienced blockchain developer and educator")
            ], instructor.address),
            
            // Create course
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Blockchain Fundamentals"),
                types.ascii("Learn the basics of blockchain technology and smart contracts"),
                types.uint(1000000), // 1 STX stake
                types.uint(500000),  // 0.5 STX reward
                types.uint(1000),    // 1000 blocks duration
                types.uint(80)       // 80% completion required
            ], instructor.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), true);
        assertEquals(block.receipts[1].result.expectOk(), types.uint(1));
        
        // Verify instructor profile
        let instructorQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-instructor',
            [types.principal(instructor.address)],
            deployer.address
        );
        
        const instructorData = instructorQuery.result.expectSome().expectTuple();
        assertEquals(instructorData['name'], types.ascii("John Doe"));
        assertEquals(instructorData['total-courses'], types.uint(1));
        
        // Verify course creation
        let courseQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-course',
            [types.uint(1)],
            deployer.address
        );
        
        const courseData = courseQuery.result.expectSome().expectTuple();
        assertEquals(courseData['instructor'], types.principal(instructor.address));
        assertEquals(courseData['title'], types.ascii("Blockchain Fundamentals"));
        assertEquals(courseData['stake-amount'], types.uint(1000000));
        assertEquals(courseData['reward-amount'], types.uint(500000));
        assertEquals(courseData['is-active'], types.bool(true));
    },
});

Clarinet.test({
    name: "Student can enroll in course with stake",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const instructor = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup: Create course first
        let setupBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("Jane Smith"),
                types.ascii("Expert instructor")
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Advanced Smart Contracts"),
                types.ascii("Deep dive into smart contract development"),
                types.uint(2000000), // 2 STX stake
                types.uint(1000000), // 1 STX reward
                types.uint(2000),    // 2000 blocks duration
                types.uint(75)       // 75% completion required
            ], instructor.address)
        ]);
        
        assertEquals(setupBlock.receipts.length, 2);
        assertEquals(setupBlock.receipts[1].result.expectOk(), types.uint(1));
        
        // Student enrolls in course
        let enrollBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'enroll-in-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        assertEquals(enrollBlock.receipts.length, 1);
        assertEquals(enrollBlock.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify enrollment
        let enrollmentQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-enrollment',
            [types.principal(student.address), types.uint(1)],
            student.address
        );
        
        const enrollmentData = enrollmentQuery.result.expectSome().expectTuple();
        assertEquals(enrollmentData['stake-paid'], types.uint(2000000));
        assertEquals(enrollmentData['progress-percentage'], types.uint(0));
        assertEquals(enrollmentData['is-completed'], types.bool(false));
        
        // Verify course stats updated
        let courseQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-course',
            [types.uint(1)],
            student.address
        );
        
        const courseData = courseQuery.result.expectSome().expectTuple();
        assertEquals(courseData['total-enrolled'], types.uint(1));
    },
});

Clarinet.test({
    name: "Instructor can add milestones and student can complete them",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const instructor = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup: Create course and enroll student
        let setupBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("Alice Johnson"),
                types.ascii("Professional educator")
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Clarity Programming"),
                types.ascii("Learn Clarity smart contract language"),
                types.uint(1500000), // 1.5 STX stake
                types.uint(750000),  // 0.75 STX reward
                types.uint(1500),    // 1500 blocks duration
                types.uint(85)       // 85% completion required
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'enroll-in-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        assertEquals(setupBlock.receipts.length, 3);
        
        // Instructor adds milestones
        let milestoneBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-milestone', [
                types.uint(1),       // course-id
                types.uint(1),       // milestone-id
                types.ascii("Introduction to Clarity"),
                types.ascii("Complete the basic syntax tutorial"),
                types.uint(25),      // 25 points
                types.bool(true)     // required
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'add-milestone', [
                types.uint(1),       // course-id
                types.uint(2),       // milestone-id
                types.ascii("First Smart Contract"),
                types.ascii("Write and deploy your first contract"),
                types.uint(50),      // 50 points
                types.bool(true)     // required
            ], instructor.address)
        ]);
        
        assertEquals(milestoneBlock.receipts.length, 2);
        assertEquals(milestoneBlock.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(milestoneBlock.receipts[1].result.expectOk(), types.bool(true));
        
        // Student completes milestones
        let completionBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'complete-milestone', [
                types.uint(1),  // course-id
                types.uint(1)   // milestone-id
            ], student.address),
            
            Tx.contractCall(CONTRACT_NAME, 'complete-milestone', [
                types.uint(1),  // course-id
                types.uint(2)   // milestone-id
            ], student.address)
        ]);
        
        assertEquals(completionBlock.receipts.length, 2);
        assertEquals(completionBlock.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(completionBlock.receipts[1].result.expectOk(), types.bool(true));
        
        // Verify milestone data
        let milestone1Query = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-milestone',
            [types.uint(1), types.uint(1)],
            instructor.address
        );
        
        const milestone1Data = milestone1Query.result.expectSome().expectTuple();
        assertEquals(milestone1Data['title'], types.ascii("Introduction to Clarity"));
        assertEquals(milestone1Data['points'], types.uint(25));
    },
});

Clarinet.test({
    name: "Instructor can update student progress and student can complete course",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const instructor = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup: Create course and enroll student
        let setupBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("Bob Wilson"),
                types.ascii("Senior developer")
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("DeFi Development"),
                types.ascii("Build decentralized finance applications"),
                types.uint(3000000), // 3 STX stake
                types.uint(2000000), // 2 STX reward
                types.uint(3000),    // 3000 blocks duration
                types.uint(90)       // 90% completion required
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'enroll-in-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        assertEquals(setupBlock.receipts.length, 3);
        
        // Instructor updates student progress
        let progressBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'update-student-progress', [
                types.principal(student.address),
                types.uint(1),  // course-id
                types.uint(95)  // 95% progress
            ], instructor.address)
        ]);
        
        assertEquals(progressBlock.receipts.length, 1);
        assertEquals(progressBlock.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify progress update
        let enrollmentQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-enrollment',
            [types.principal(student.address), types.uint(1)],
            student.address
        );
        
        const enrollmentData = enrollmentQuery.result.expectSome().expectTuple();
        assertEquals(enrollmentData['progress-percentage'], types.uint(95));
        
        // Student completes course and claims rewards
        let completionBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'complete-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        assertEquals(completionBlock.receipts.length, 1);
        assertEquals(completionBlock.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify course completion
        let updatedEnrollmentQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-enrollment',
            [types.principal(student.address), types.uint(1)],
            student.address
        );
        
        const updatedEnrollmentData = updatedEnrollmentQuery.result.expectSome().expectTuple();
        assertEquals(updatedEnrollmentData['is-completed'], types.bool(true));
        assertEquals(updatedEnrollmentData['completed-at'].expectSome(), types.uint(completionBlock.height));
    },
});

Clarinet.test({
    name: "Error handling: Cannot enroll twice in same course",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const instructor = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup course
        let setupBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("Carol Davis"),
                types.ascii("Blockchain expert")
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("NFT Development"),
                types.ascii("Create and trade NFTs"),
                types.uint(1000000),
                types.uint(500000),
                types.uint(1000),
                types.uint(80)
            ], instructor.address)
        ]);
        
        // First enrollment - should succeed
        let firstEnrollBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'enroll-in-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        assertEquals(firstEnrollBlock.receipts[0].result.expectOk(), types.bool(true));
        
        // Second enrollment - should fail
        let secondEnrollBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'enroll-in-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        assertEquals(secondEnrollBlock.receipts[0].result.expectErr(), types.uint(105)); // err-already-enrolled
    },
});

Clarinet.test({
    name: "Error handling: Cannot complete course without sufficient progress",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const instructor = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup and enroll
        let setupBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("David Kim"),
                types.ascii("Web3 instructor")
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Web3 Integration"),
                types.ascii("Connect Web2 apps to blockchain"),
                types.uint(2000000),
                types.uint(1000000),
                types.uint(2000),
                types.uint(75) // 75% required
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'enroll-in-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        // Set progress to 60% (below requirement)
        let progressBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'update-student-progress', [
                types.principal(student.address),
                types.uint(1),
                types.uint(60)
            ], instructor.address)
        ]);
        
        // Try to complete course - should fail
        let completionBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'complete-course', [
                types.uint(1)
            ], student.address)
        ]);
        
        assertEquals(completionBlock.receipts[0].result.expectErr(), types.uint(109)); // err-insufficient-progress
    },
});

Clarinet.test({
    name: "Admin functions: Owner can toggle course status and set platform fee",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const instructor = accounts.get('wallet_1')!;
        const nonOwner = accounts.get('wallet_2')!;
        
        // Setup course
        let setupBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("Eve Martinez"),
                types.ascii("DApp developer")
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Stacks Ecosystem"),
                types.ascii("Explore the Stacks blockchain ecosystem"),
                types.uint(1500000),
                types.uint(750000),
                types.uint(1500),
                types.uint(80)
            ], instructor.address)
        ]);
        
        // Owner can toggle course status
        let toggleBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'toggle-course-status', [
                types.uint(1)
            ], deployer.address)
        ]);
        
        assertEquals(toggleBlock.receipts[0].result.expectOk(), types.bool(true));
        
        // Non-owner cannot toggle course status
        let unauthorizedToggleBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'toggle-course-status', [
                types.uint(1)
            ], nonOwner.address)
        ]);
        
        assertEquals(unauthorizedToggleBlock.receipts[0].result.expectErr(), types.uint(100)); // err-owner-only
        
        // Owner can set platform fee
        let feeBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'set-platform-fee', [
                types.uint(10) // 10% fee
            ], deployer.address)
        ]);
        
        assertEquals(feeBlock.receipts[0].result.expectOk(), types.bool(true));
        
        // Non-owner cannot set platform fee
        let unauthorizedFeeBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'set-platform-fee', [
                types.uint(15)
            ], nonOwner.address)
        ]);
        
        assertEquals(unauthorizedFeeBlock.receipts[0].result.expectErr(), types.uint(100)); // err-owner-only
    },
});

Clarinet.test({
    name: "Course ID counter increments correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const instructor = accounts.get('wallet_1')!;
        const deployer = accounts.get('deployer')!;
        
        // Check initial course ID
        let initialQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-next-course-id',
            [],
            deployer.address
        );
        assertEquals(initialQuery.result, types.uint(1));
        
        // Register instructor
        let registerBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'register-instructor', [
                types.ascii("Frank Chen"),
                types.ascii("Cryptocurrency educator")
            ], instructor.address)
        ]);
        
        // Create multiple courses
        let courseBlock = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Course 1"),
                types.ascii("First course"),
                types.uint(1000000),
                types.uint(500000),
                types.uint(1000),
                types.uint(80)
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Course 2"),
                types.ascii("Second course"),
                types.uint(2000000),
                types.uint(1000000),
                types.uint(2000),
                types.uint(85)
            ], instructor.address),
            
            Tx.contractCall(CONTRACT_NAME, 'create-course', [
                types.ascii("Course 3"),
                types.ascii("Third course"),
                types.uint(1500000),
                types.uint(750000),
                types.uint(1500),
                types.uint(75)
            ], instructor.address)
        ]);
        
        assertEquals(courseBlock.receipts.length, 3);
        assertEquals(courseBlock.receipts[0].result.expectOk(), types.uint(1));
        assertEquals(courseBlock.receipts[1].result.expectOk(), types.uint(2));
        assertEquals(courseBlock.receipts[2].result.expectOk(), types.uint(3));
        
        // Check final course ID counter
        let finalQuery = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-next-course-id',
            [],
            deployer.address
        );
        assertEquals(finalQuery.result, types.uint(4));
    },
});
