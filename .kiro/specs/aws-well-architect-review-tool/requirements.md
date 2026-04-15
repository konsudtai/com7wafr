# Requirements Document

## Introduction

เครื่องมือ AWS Well-Architected Review Tool เป็นเครื่องมืออัตโนมัติสำหรับตรวจสอบและประเมินการตั้งค่า AWS environment ตาม 5 เสาหลักของ AWS Well-Architected Framework ได้แก่ Security, Reliability, Operational Excellence, Performance Efficiency และ Cost Optimization เครื่องมือนี้ได้รับแรงบันดาลใจจากโปรเจกต์ service-screener-v2 โดยจะทำการเรียก AWS APIs เพื่อตรวจสอบการตั้งค่าของ resources ต่างๆ แล้วสร้างรายงานพร้อมคำแนะนำตาม best practices

## Glossary

- **Review_Tool**: ระบบหลักที่ทำหน้าที่ประสานงานการสแกน ตรวจสอบ และสร้างรายงาน
- **Scanner**: ส่วนประกอบที่ทำหน้าที่เรียก AWS APIs เพื่อดึงข้อมูลการตั้งค่าของ resources
- **Rule_Engine**: ส่วนประกอบที่ทำหน้าที่ประเมินการตั้งค่าของ resources ตามกฎที่กำหนดไว้
- **Report_Generator**: ส่วนประกอบที่ทำหน้าที่สร้างรายงานผลการตรวจสอบ
- **Config_Parser**: ส่วนประกอบที่ทำหน้าที่อ่านและแปลงไฟล์การตั้งค่า
- **Finding**: ผลการตรวจสอบที่ระบุปัญหาหรือคำแนะนำสำหรับ resource หนึ่งๆ
- **Check**: กฎการตรวจสอบเฉพาะที่ map กับ Well-Architected pillar
- **Pillar**: หนึ่งใน 5 เสาหลักของ AWS Well-Architected Framework (Security, Reliability, Operational Excellence, Performance Efficiency, Cost Optimization)
- **Suppression_File**: ไฟล์ที่ระบุ findings ที่ต้องการข้ามไม่แสดงในรายงาน
- **Scan_Configuration**: การตั้งค่าที่กำหนดขอบเขตการสแกน เช่น regions, services, tags
- **WA_Integration**: ส่วนประกอบที่เชื่อมต่อกับ AWS Well-Architected Tool API
- **Account_Manager**: ส่วนประกอบที่ทำหน้าที่จัดการรายการ AWS accounts ที่เครื่องมือสามารถสแกนได้ รวมถึงการเพิ่ม ลบ แก้ไข และตรวจสอบการเชื่อมต่อของแต่ละ account
- **Account_Configuration**: ข้อมูลการตั้งค่าของ AWS account ที่ลงทะเบียนไว้ ประกอบด้วย account ID, IAM role ARN สำหรับ assume role, alias/ชื่อเรียก, และสถานะการเชื่อมต่อ
- **STS_Client**: ส่วนประกอบที่ทำหน้าที่เรียก AWS Security Token Service (STS) เพื่อ assume role ไปยัง target accounts
- **Installer**: ส่วนประกอบที่ทำหน้าที่ติดตั้งเครื่องมือลงใน AWS account ผ่าน AWS CloudShell ด้วยคำสั่งเดียว
- **Dashboard**: ส่วนประกอบที่แสดงผลการตรวจสอบในรูปแบบ web application ที่ deploy บน CloudFront + S3 พร้อม charts, graphs, และ interactive elements รองรับการสั่ง scan แบบ real-time
- **API_Backend**: ส่วนประกอบ backend ที่ทำงานบน API Gateway + Lambda Function สำหรับรับคำสั่งสแกน จัดการ accounts และส่งผลลัพธ์
- **Data_Store**: ฐานข้อมูล DynamoDB ที่จัดเก็บผลการสแกน account configurations และประวัติการตรวจสอบ
- **Cognito_UserPool**: Amazon Cognito User Pool ที่ใช้จัดเก็บข้อมูลผู้ใช้งาน (users) และจัดการ authentication สำหรับ web application
- **Auth_Module**: ส่วนประกอบที่ทำหน้าที่จัดการ authentication และ authorization ผ่าน Amazon Cognito รวมถึง login, logout, token management, และ session management
- **Team_Manager**: ส่วนประกอบที่ทำหน้าที่จัดการทีมงาน (team members) ในระบบ รวมถึงการเพิ่ม ลบ แก้ไข และกำหนด role ของสมาชิกในทีม
- **User_Role**: บทบาทของผู้ใช้งานในระบบ ประกอบด้วย Admin (สามารถจัดการทีมงานและตั้งค่าระบบ) และ Viewer (สามารถดูรายงานและผลการสแกนเท่านั้น)

## Requirements

### Requirement 1: การสแกน AWS Resources แบบ Multi-Region

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการสแกน AWS resources ข้ามหลาย regions ได้ เพื่อให้สามารถตรวจสอบ environment ทั้งหมดได้ในครั้งเดียว

#### Acceptance Criteria

1. WHEN ผู้ใช้ระบุรายการ regions, THE Scanner SHALL สแกน resources ในทุก region ที่ระบุ
2. WHEN ผู้ใช้ไม่ระบุ region, THE Scanner SHALL สแกน resources ใน region ปัจจุบันที่ตั้งค่าไว้ใน AWS credentials
3. WHEN region ที่ระบุไม่ถูกต้องหรือไม่สามารถเข้าถึงได้, THE Scanner SHALL บันทึก error สำหรับ region นั้นและดำเนินการสแกน regions ที่เหลือต่อไป
4. THE Scanner SHALL รองรับการสแกนพร้อมกัน (concurrent) ข้ามหลาย regions เพื่อลดเวลาในการสแกน

### Requirement 2: การกรอง Resources ตาม Services

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการเลือกสแกนเฉพาะ AWS services ที่ต้องการ เพื่อให้สามารถโฟกัสการตรวจสอบได้ตรงจุด

#### Acceptance Criteria

1. WHEN ผู้ใช้ระบุรายการ services ที่ต้องการสแกน, THE Scanner SHALL สแกนเฉพาะ services ที่ระบุเท่านั้น
2. WHEN ผู้ใช้ไม่ระบุ services, THE Scanner SHALL สแกนทุก services ที่รองรับ
3. IF ผู้ใช้ระบุ service ที่ไม่รองรับ, THEN THE Review_Tool SHALL แสดงข้อความแจ้งเตือนและข้ามการสแกน service นั้น
4. THE Review_Tool SHALL รองรับ services อย่างน้อย: EC2, S3, RDS, IAM, Lambda, DynamoDB, ELB, CloudFront, ECS, และ EKS

### Requirement 3: การกรอง Resources ตาม Tags

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการกรอง resources ตาม tags เพื่อให้สามารถตรวจสอบเฉพาะ resources ของทีมหรือโปรเจกต์ที่ต้องการ

#### Acceptance Criteria

1. WHEN ผู้ใช้ระบุ tag key-value pairs, THE Scanner SHALL สแกนเฉพาะ resources ที่มี tags ตรงกับที่ระบุ
2. WHEN ผู้ใช้ระบุหลาย tag filters, THE Scanner SHALL กรอง resources ที่ตรงกับทุก tag conditions (AND logic)
3. WHEN resource ไม่มี tags ที่ระบุ, THE Scanner SHALL ข้าม resource นั้น
4. IF tag filter format ไม่ถูกต้อง, THEN THE Review_Tool SHALL แสดงข้อความ error ที่อธิบาย format ที่ถูกต้อง

### Requirement 4: การตรวจสอบตาม Well-Architected Pillars

**User Story:** ในฐานะ Solutions Architect ฉันต้องการให้ผลการตรวจสอบถูกจัดหมวดหมู่ตาม Well-Architected pillars เพื่อให้สามารถประเมินสถานะของ environment ตามแต่ละ pillar ได้

#### Acceptance Criteria

1. THE Rule_Engine SHALL จัดหมวดหมู่ทุก check ให้ตรงกับอย่างน้อยหนึ่ง Well-Architected pillar
2. THE Rule_Engine SHALL รองรับทั้ง 5 pillars: Security, Reliability, Operational Excellence, Performance Efficiency, และ Cost Optimization
3. WHEN การตรวจสอบเสร็จสิ้น, THE Rule_Engine SHALL สร้าง Finding object ที่ประกอบด้วย resource identifier, pillar, severity level, คำอธิบาย, และคำแนะนำ
4. THE Rule_Engine SHALL กำหนด severity level ให้แต่ละ finding เป็นหนึ่งใน: CRITICAL, HIGH, MEDIUM, LOW, หรือ INFORMATIONAL

### Requirement 5: การสร้างรายงาน HTML (CLI Output)

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการรายงานในรูปแบบ HTML ที่มี interactive UI สำหรับการใช้งานผ่าน CLI เพื่อให้สามารถดูและวิเคราะห์ผลการตรวจสอบได้สะดวกแบบ offline

#### Acceptance Criteria

1. WHEN การสแกนเสร็จสิ้น, THE Report_Generator SHALL สร้างรายงาน HTML ที่แสดงผลการตรวจสอบทั้งหมด
2. THE Report_Generator SHALL แสดง summary dashboard ที่รวมจำนวน findings แยกตาม pillar และ severity level
3. THE Report_Generator SHALL รองรับการกรองและค้นหา findings ตาม service, region, pillar, และ severity level ใน UI
4. THE Report_Generator SHALL แสดงคำแนะนำและลิงก์ไปยัง AWS documentation สำหรับแต่ละ finding
5. THE Report_Generator SHALL สร้างไฟล์ HTML ที่สามารถเปิดดูได้โดยไม่ต้องใช้ web server (self-contained)

### Requirement 6: การสร้าง Output ในรูปแบบ JSON

**User Story:** ในฐานะ DevOps Engineer ฉันต้องการผลการตรวจสอบในรูปแบบ JSON เพื่อให้สามารถนำไปใช้ในระบบอัตโนมัติหรือ pipeline อื่นๆ ได้

#### Acceptance Criteria

1. WHEN การสแกนเสร็จสิ้น, THE Report_Generator SHALL สร้างไฟล์ JSON ที่มีผลการตรวจสอบทั้งหมด
2. THE Report_Generator SHALL สร้างไฟล์ JSON สองรูปแบบ: raw data (api-raw.json) และ full report (api-full.json)
3. THE Report_Generator SHALL ใช้ JSON schema ที่กำหนดไว้อย่างชัดเจนสำหรับ output
4. FOR ALL valid Finding objects, การแปลง Finding เป็น JSON แล้วแปลงกลับเป็น Finding object SHALL ได้ผลลัพธ์ที่เทียบเท่ากับ object ต้นฉบับ (round-trip property)

### Requirement 7: การจัดการ Suppression Files

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการระบุ findings ที่ต้องการข้ามไม่แสดงในรายงาน เพื่อให้สามารถโฟกัสเฉพาะ findings ที่เกี่ยวข้อง

#### Acceptance Criteria

1. WHEN ผู้ใช้ระบุ suppression file, THE Review_Tool SHALL อ่านไฟล์และข้าม findings ที่ตรงกับ suppression rules
2. THE Config_Parser SHALL รองรับ suppression rules ที่ระบุตาม service, check ID, resource ID, หรือ combination ของทั้งสาม
3. IF suppression file มี format ไม่ถูกต้อง, THEN THE Config_Parser SHALL แสดงข้อความ error ที่ระบุตำแหน่งและสาเหตุของ error
4. WHEN suppression ถูกใช้งาน, THE Report_Generator SHALL แสดงจำนวน suppressed findings แยกต่างหากในรายงาน
5. FOR ALL valid suppression configurations, การแปลง suppression config เป็น file format แล้วอ่านกลับ SHALL ได้ผลลัพธ์ที่เทียบเท่ากับ config ต้นฉบับ (round-trip property)

### Requirement 8: การเชื่อมต่อกับ AWS Well-Architected Tool

**User Story:** ในฐานะ Solutions Architect ฉันต้องการส่งผลการตรวจสอบไปยัง AWS Well-Architected Tool เพื่อให้สามารถติดตามและจัดการ findings ผ่าน AWS Console ได้

#### Acceptance Criteria

1. WHEN ผู้ใช้เลือก option การเชื่อมต่อ Well-Architected Tool, THE WA_Integration SHALL สร้าง workload ใน AWS Well-Architected Tool
2. WHEN workload ถูกสร้างแล้ว, THE WA_Integration SHALL สร้าง milestone ที่บันทึกผลการตรวจสอบ ณ เวลาที่สแกน
3. IF การเชื่อมต่อ Well-Architected Tool API ล้มเหลว, THEN THE WA_Integration SHALL บันทึก error และสร้างรายงานปกติโดยไม่หยุดการทำงาน
4. THE WA_Integration SHALL map findings กับ Well-Architected Tool questions ที่เกี่ยวข้อง

### Requirement 9: การสแกนข้าม AWS Accounts (Cross-Account)

**User Story:** ในฐานะ Cloud Architect ฉันต้องการสแกน resources ข้ามหลาย AWS accounts เพื่อให้สามารถตรวจสอบ multi-account environment ได้

#### Acceptance Criteria

1. WHEN ผู้ใช้เริ่มการสแกน cross-account, THE Scanner SHALL ดึงรายการ accounts จาก Account_Manager และ assume role ผ่าน STS ไปยังแต่ละ target account
2. WHEN ผู้ใช้ระบุหลาย account configurations, THE Scanner SHALL สแกนทุก accounts ตามลำดับหรือแบบ concurrent
3. IF การ assume role ล้มเหลว, THEN THE Scanner SHALL บันทึก error สำหรับ account นั้นและดำเนินการสแกน accounts ที่เหลือต่อไป
4. THE Report_Generator SHALL แสดงผลการตรวจสอบแยกตาม account ในรายงาน

### Requirement 10: การจัดการ Scan Configuration

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการกำหนดค่าการสแกนผ่าน configuration file เพื่อให้สามารถบันทึกและนำกลับมาใช้ซ้ำได้

#### Acceptance Criteria

1. THE Config_Parser SHALL รองรับการอ่าน scan configuration จากไฟล์ในรูปแบบ JSON หรือ YAML
2. THE Config_Parser SHALL validate scan configuration ก่อนเริ่มการสแกน
3. IF scan configuration มีค่าที่ไม่ถูกต้อง, THEN THE Config_Parser SHALL แสดงข้อความ error ที่ระบุ field และสาเหตุของ error
4. WHEN ผู้ใช้ระบุทั้ง command-line arguments และ configuration file, THE Review_Tool SHALL ให้ command-line arguments มีความสำคัญเหนือกว่า configuration file
5. FOR ALL valid Scan_Configuration objects, การแปลง config เป็น JSON/YAML แล้วอ่านกลับ SHALL ได้ผลลัพธ์ที่เทียบเท่ากับ config ต้นฉบับ (round-trip property)

### Requirement 11: การทำงานแบบ Concurrent Execution

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการให้การสแกนทำงานแบบ concurrent เพื่อลดเวลาในการสแกน environment ขนาดใหญ่

#### Acceptance Criteria

1. THE Scanner SHALL รองรับการสแกนหลาย services และ regions แบบ concurrent
2. WHEN เกิด error ใน concurrent task หนึ่ง, THE Scanner SHALL จัดการ error นั้นโดยไม่กระทบ tasks อื่นที่กำลังทำงาน
3. THE Scanner SHALL จำกัดจำนวน concurrent tasks ตามค่าที่กำหนดได้ (configurable concurrency limit)
4. WHEN การสแกนแบบ concurrent เสร็จสิ้น, THE Scanner SHALL รวมผลลัพธ์จากทุก tasks เข้าด้วยกันอย่างถูกต้อง

### Requirement 12: การจัดการ Errors และ Logging

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการให้เครื่องมือจัดการ errors อย่างเหมาะสมและมี logging ที่ชัดเจน เพื่อให้สามารถ debug ปัญหาได้

#### Acceptance Criteria

1. THE Review_Tool SHALL บันทึก log ในระดับ DEBUG, INFO, WARNING, และ ERROR
2. WHEN เกิด error ที่ไม่คาดคิดระหว่างการสแกน, THE Review_Tool SHALL บันทึก error พร้อม stack trace และดำเนินการสแกนส่วนที่เหลือต่อไป
3. IF AWS API call ล้มเหลวเนื่องจาก rate limiting, THEN THE Scanner SHALL ทำ retry ด้วย exponential backoff
4. THE Review_Tool SHALL แสดง progress indicator ระหว่างการสแกนที่ระบุ service และ region ที่กำลังสแกน
5. WHEN การสแกนเสร็จสิ้น, THE Review_Tool SHALL แสดง summary ที่ระบุจำนวน resources ที่สแกน, findings ที่พบ, และ errors ที่เกิดขึ้น

### Requirement 13: Command-Line Interface (CLI)

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการใช้งานเครื่องมือผ่าน command-line interface เพื่อให้สามารถรวมเข้ากับ scripts และ CI/CD pipelines ได้

#### Acceptance Criteria

1. THE Review_Tool SHALL รองรับ command-line arguments สำหรับ: regions, services, tags, output directory, suppression file, concurrency limit, verbosity level, และ account management subcommands (add-account, remove-account, list-accounts, verify-account)
2. WHEN ผู้ใช้เรียกใช้งานด้วย --help flag, THE Review_Tool SHALL แสดงรายละเอียดของทุก arguments พร้อมตัวอย่างการใช้งาน
3. IF ผู้ใช้ระบุ arguments ที่ไม่ถูกต้อง, THEN THE Review_Tool SHALL แสดงข้อความ error ที่ชัดเจนพร้อมแนะนำ argument ที่ถูกต้อง
4. THE Review_Tool SHALL รองรับ exit codes ที่แตกต่างกันตามผลการสแกน: 0 สำหรับสำเร็จไม่มี critical findings, 1 สำหรับมี critical findings, 2 สำหรับ execution error

### Requirement 14: Rule Definition และ Extensibility

**User Story:** ในฐานะ Developer ฉันต้องการเพิ่ม custom checks ได้ง่าย เพื่อให้สามารถขยายการตรวจสอบตามความต้องการเฉพาะขององค์กร

#### Acceptance Criteria

1. THE Rule_Engine SHALL โหลด check definitions จาก structured configuration files
2. THE Rule_Engine SHALL รองรับ check definition ที่ประกอบด้วย: check ID, description, pillar mapping, severity, evaluation logic reference, และ remediation guidance
3. WHEN เพิ่ม check definition ใหม่, THE Rule_Engine SHALL โหลดและใช้งาน check นั้นโดยไม่ต้องแก้ไข core code
4. IF check definition มี format ไม่ถูกต้อง, THEN THE Rule_Engine SHALL แสดงข้อความ error ที่ระบุ check ID และสาเหตุของ error

### Requirement 15: การจัดการ AWS Accounts (Account Management)

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการเครื่องมือสำหรับเพิ่ม ลบ แก้ไข และจัดการรายการ AWS accounts ที่ต้องการสแกน เพื่อให้สามารถบริหาร multi-account environment ได้อย่างสะดวกผ่านการ Assume Role ด้วย STS

#### Acceptance Criteria

1. THE Account_Manager SHALL จัดเก็บรายการ account configurations ในไฟล์รูปแบบ JSON หรือ YAML สำหรับ CLI mode และใน Data_Store (DynamoDB) สำหรับ web application mode
2. WHEN ผู้ใช้เพิ่ม account ใหม่, THE Account_Manager SHALL บันทึก account ID, IAM role ARN สำหรับ assume role, และ alias ของ account นั้น
3. WHEN ผู้ใช้เพิ่ม account ใหม่, THE Account_Manager SHALL ตรวจสอบรูปแบบของ IAM role ARN ว่าถูกต้องตาม pattern arn:aws:iam::<account-id>:role/<role-name>
4. WHEN ผู้ใช้เพิ่ม account ใหม่, THE STS_Client SHALL ทดสอบการ assume role ไปยัง target account เพื่อยืนยันว่าสามารถเชื่อมต่อได้สำเร็จ
5. IF การ assume role ทดสอบล้มเหลว, THEN THE Account_Manager SHALL แสดงข้อความ error ที่ระบุสาเหตุ เช่น role ไม่มีอยู่ trust policy ไม่อนุญาต หรือ permissions ไม่เพียงพอ
6. THE Account_Manager SHALL รองรับการลบ account ออกจากรายการโดยระบุ account ID หรือ alias
7. THE Account_Manager SHALL รองรับการแก้ไข role ARN หรือ alias ของ account ที่ลงทะเบียนไว้แล้ว
8. WHEN ผู้ใช้ร้องขอรายการ accounts, THE Account_Manager SHALL แสดงรายการ accounts ทั้งหมดพร้อม account ID, alias, role ARN, และสถานะการเชื่อมต่อล่าสุด
9. THE Account_Manager SHALL ตรวจสอบว่าไม่มี account ID ซ้ำกันในรายการ
10. WHEN เริ่มการสแกน, THE Scanner SHALL ใช้ข้อมูลจาก Account_Manager เพื่อ assume role ผ่าน STS ไปยังแต่ละ target account ที่ลงทะเบียนไว้
11. THE STS_Client SHALL ใช้ temporary credentials ที่ได้จากการ assume role โดยกำหนด session duration ที่ configurable ได้ (ค่าเริ่มต้น 3600 วินาที)
12. IF temporary credentials หมดอายุระหว่างการสแกน, THEN THE STS_Client SHALL ทำการ assume role ใหม่โดยอัตโนมัติเพื่อรับ credentials ชุดใหม่
13. FOR ALL valid Account_Configuration objects, การแปลง account config เป็น JSON/YAML แล้วอ่านกลับ SHALL ได้ผลลัพธ์ที่เทียบเท่ากับ config ต้นฉบับ (round-trip property)

### Requirement 16: การติดตั้งผ่าน AWS CloudShell (One-Command Installation)

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการติดตั้งเครื่องมือลงใน AWS account ผ่าน AWS CloudShell ด้วยคำสั่งเดียวที่สามารถ copy-paste ได้ เพื่อให้การติดตั้งรวดเร็วและสะดวก

#### Acceptance Criteria

1. THE Installer SHALL จัดเตรียมคำสั่งติดตั้งแบบบรรทัดเดียว (one-liner) ที่สามารถ copy-paste ลงใน AWS CloudShell ได้โดยตรง
2. WHEN ผู้ใช้รันคำสั่งติดตั้งใน AWS CloudShell, THE Installer SHALL ดาวน์โหลดและติดตั้ง dependencies ที่จำเป็นทั้งหมดโดยอัตโนมัติ
3. WHEN การติดตั้งเสร็จสิ้น, THE Installer SHALL แสดงข้อความยืนยันพร้อมตัวอย่างคำสั่งการใช้งานเบื้องต้น
4. IF การติดตั้งล้มเหลว, THEN THE Installer SHALL แสดงข้อความ error ที่ระบุสาเหตุและขั้นตอนการแก้ไข
5. THE Installer SHALL ตรวจสอบว่ากำลังทำงานใน environment ที่รองรับ (AWS CloudShell หรือ Linux-based environment) ก่อนเริ่มติดตั้ง
6. THE Installer SHALL ไม่ต้องการ sudo หรือ root permissions สำหรับการติดตั้งใน AWS CloudShell
7. WHEN ติดตั้งเสร็จสิ้น, THE Installer SHALL ตั้งค่า PATH ให้สามารถเรียกใช้เครื่องมือได้ทันทีโดยไม่ต้อง restart session

### Requirement 17: Well-Architected Dashboard (Web Application)

**User Story:** ในฐานะ Solutions Architect ฉันต้องการ web dashboard ที่สวยงามและใช้งานง่ายสำหรับแสดงผลการตรวจสอบ Well-Architected แบบ real-time เพื่อให้สามารถสั่ง scan และดูผลลัพธ์ได้ทันทีผ่าน browser

#### Acceptance Criteria

1. THE Dashboard SHALL deploy เป็น static web application บน Amazon S3 และให้บริการผ่าน Amazon CloudFront
2. THE Dashboard SHALL แสดง overview page ที่มี overall score ของแต่ละ Well-Architected pillar ในรูปแบบ radar chart หรือ spider chart
3. THE Dashboard SHALL แสดง severity distribution ของ findings ในรูปแบบ donut chart หรือ bar chart แยกตาม pillar
4. THE Dashboard SHALL แสดง heatmap ที่แสดงจำนวน findings แยกตาม service และ pillar เพื่อระบุจุดที่ต้องปรับปรุงเร่งด่วน
5. THE Dashboard SHALL รองรับการกรอง findings ตาม account, region, service, pillar, และ severity level แบบ interactive
6. THE Dashboard SHALL แสดง trend comparison เมื่อมีผลการสแกนหลายครั้ง เพื่อแสดงพัฒนาการของ environment
7. WHEN ผู้ใช้คลิกที่ finding ใน Dashboard, THE Dashboard SHALL แสดงรายละเอียดของ finding พร้อมคำแนะนำและลิงก์ไปยัง AWS documentation
8. THE Dashboard SHALL รองรับ dark mode และ light mode
9. THE Dashboard SHALL แสดง account summary card สำหรับแต่ละ AWS account ที่สแกน พร้อมจำนวน findings แยกตาม severity
10. WHEN ผู้ใช้กดปุ่ม Run Check บน Dashboard, THE Dashboard SHALL เรียก API_Backend เพื่อเริ่มการสแกนและแสดง progress แบบ real-time
11. THE Dashboard SHALL รองรับการ export รายงานเป็น PDF จากหน้า Dashboard
12. WHEN การสแกนกำลังดำเนินการ, THE Dashboard SHALL แสดง progress bar พร้อมระบุ service และ region ที่กำลังสแกน

### Requirement 18: Backend Infrastructure (API Gateway + Lambda + DynamoDB)

**User Story:** ในฐานะ Cloud Engineer ฉันต้องการ backend ที่ทำงานแบบ serverless บน AWS เพื่อรองรับการสแกน การจัดการ accounts และการจัดเก็บผลลัพธ์อย่างมีประสิทธิภาพ

#### Acceptance Criteria

1. THE API_Backend SHALL ให้บริการผ่าน Amazon API Gateway ที่เชื่อมต่อกับ AWS Lambda Functions
2. THE API_Backend SHALL จัดเตรียม REST API endpoints สำหรับ: เริ่มการสแกน, ดูสถานะการสแกน, ดูผลการสแกน, จัดการ accounts (CRUD), และดูประวัติการสแกน
3. THE Data_Store SHALL จัดเก็บข้อมูลใน Amazon DynamoDB โดยแยก tables สำหรับ: scan results, account configurations, และ scan history
4. WHEN ผู้ใช้เริ่มการสแกนผ่าน API, THE API_Backend SHALL สร้าง scan job และประมวลผลแบบ asynchronous ผ่าน Lambda Function
5. THE API_Backend SHALL จัดเก็บผลการสแกนทุกครั้งลงใน Data_Store พร้อม timestamp เพื่อรองรับการดูประวัติและ trend comparison
6. IF Lambda Function ทำงานเกิน timeout limit, THEN THE API_Backend SHALL แบ่งการสแกนเป็น chunks ย่อยและประมวลผลแบบ parallel
7. THE API_Backend SHALL รองรับ authentication และ authorization สำหรับการเข้าถึง API endpoints
8. WHEN ผู้ใช้ร้องขอสถานะการสแกน, THE API_Backend SHALL ส่งคืนสถานะปัจจุบัน (PENDING, IN_PROGRESS, COMPLETED, FAILED) พร้อม progress percentage
9. THE Data_Store SHALL ใช้ DynamoDB TTL สำหรับลบข้อมูลสแกนเก่าที่เกินระยะเวลาที่กำหนด (configurable retention period)
10. THE API_Backend SHALL รองรับ CORS configuration เพื่อให้ Dashboard frontend สามารถเรียก API ได้


### Requirement 19: การยืนยันตัวตนและการอนุญาต (Authentication & Authorization with Cognito)

**User Story:** ในฐานะ Platform Admin ฉันต้องการระบบ login/logout ที่ใช้ Amazon Cognito User Pool สำหรับจัดการผู้ใช้งาน เพื่อให้มั่นใจว่าเฉพาะผู้ที่ได้รับอนุญาตเท่านั้นที่สามารถเข้าถึง Dashboard และ API ได้

#### Acceptance Criteria

1. THE Auth_Module SHALL ใช้ Amazon Cognito User Pool เป็นระบบจัดเก็บข้อมูลผู้ใช้งานและจัดการ authentication
2. THE Dashboard SHALL แสดงหน้า login ที่รองรับการเข้าสู่ระบบด้วย email และ password ผ่าน Cognito_UserPool
3. WHEN ผู้ใช้กรอก email และ password ที่ถูกต้อง, THE Auth_Module SHALL ออก JWT tokens (ID token, access token, refresh token) และเปลี่ยนเส้นทางไปยังหน้า Dashboard
4. IF ผู้ใช้กรอก email หรือ password ไม่ถูกต้อง, THEN THE Auth_Module SHALL แสดงข้อความ error ที่ชัดเจนโดยไม่เปิดเผยว่า email หรือ password ที่ผิด
5. WHEN ผู้ใช้กดปุ่ม logout, THE Auth_Module SHALL ลบ tokens ออกจาก client session และเปลี่ยนเส้นทางไปยังหน้า login
6. THE Auth_Module SHALL ตรวจสอบ JWT token ก่อนอนุญาตให้เข้าถึงทุก API endpoint ของ API_Backend
7. IF JWT token หมดอายุ, THEN THE Auth_Module SHALL ใช้ refresh token เพื่อขอ token ชุดใหม่โดยอัตโนมัติ
8. IF refresh token หมดอายุ, THEN THE Auth_Module SHALL เปลี่ยนเส้นทางผู้ใช้ไปยังหน้า login
9. THE Auth_Module SHALL รองรับ User_Role สองระดับ: Admin และ Viewer โดยจัดเก็บ role ใน Cognito User Pool custom attributes
10. WHILE ผู้ใช้มี User_Role เป็น Viewer, THE API_Backend SHALL อนุญาตให้เข้าถึงเฉพาะ API endpoints สำหรับดูผลการสแกนและรายงานเท่านั้น (read-only)
11. WHILE ผู้ใช้มี User_Role เป็น Admin, THE API_Backend SHALL อนุญาตให้เข้าถึงทุก API endpoints รวมถึงการจัดการ accounts, เริ่มการสแกน, และจัดการทีมงาน
12. THE API_Backend SHALL ใช้ Amazon Cognito Authorizer บน API Gateway เพื่อ validate JWT tokens สำหรับทุก API requests

### Requirement 20: การจัดการทีมงาน (Team Management)

**User Story:** ในฐานะ Platform Admin ฉันต้องการเพิ่มสมาชิกในทีมเข้ามาใช้งานระบบได้ เพื่อให้ทีมงานสามารถเข้าถึง Dashboard และดูผลการตรวจสอบร่วมกันได้

#### Acceptance Criteria

1. THE Team_Manager SHALL จัดเตรียมหน้า Team Management บน Dashboard สำหรับจัดการสมาชิกในทีม
2. WHILE ผู้ใช้มี User_Role เป็น Admin, THE Team_Manager SHALL อนุญาตให้เพิ่มสมาชิกใหม่โดยระบุ email และ User_Role (Admin หรือ Viewer)
3. WHEN Admin เพิ่มสมาชิกใหม่, THE Team_Manager SHALL สร้าง user ใน Cognito_UserPool และส่ง invitation email พร้อม temporary password ไปยัง email ที่ระบุ
4. WHEN สมาชิกใหม่ login ครั้งแรกด้วย temporary password, THE Auth_Module SHALL บังคับให้เปลี่ยน password ก่อนเข้าใช้งาน
5. WHILE ผู้ใช้มี User_Role เป็น Admin, THE Team_Manager SHALL อนุญาตให้ลบสมาชิกออกจากทีมโดยระบุ email
6. WHEN Admin ลบสมาชิก, THE Team_Manager SHALL ลบ user ออกจาก Cognito_UserPool และ revoke ทุก active sessions ของ user นั้น
7. WHILE ผู้ใช้มี User_Role เป็น Admin, THE Team_Manager SHALL อนุญาตให้เปลี่ยน User_Role ของสมาชิกคนอื่นได้ (Admin เป็น Viewer หรือ Viewer เป็น Admin)
8. THE Team_Manager SHALL แสดงรายการสมาชิกทั้งหมดพร้อม email, User_Role, สถานะ (active/invited), และวันที่เข้าร่วม
9. IF Admin พยายามลบตัวเอง, THEN THE Team_Manager SHALL ปฏิเสธการดำเนินการและแสดงข้อความแจ้งเตือนว่าไม่สามารถลบตัวเองได้
10. THE Team_Manager SHALL ตรวจสอบว่าต้องมี Admin อย่างน้อยหนึ่งคนในระบบเสมอ
11. WHILE ผู้ใช้มี User_Role เป็น Viewer, THE Dashboard SHALL ซ่อนหน้า Team Management และเมนูที่เกี่ยวข้องกับการจัดการทีม
12. THE API_Backend SHALL จัดเตรียม REST API endpoints สำหรับ: เพิ่มสมาชิก (POST /team/members), ลบสมาชิก (DELETE /team/members/{email}), แก้ไข role (PUT /team/members/{email}/role), และดูรายการสมาชิก (GET /team/members)
