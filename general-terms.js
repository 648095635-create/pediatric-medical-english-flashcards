window.GENERAL_MEDICAL_TERMS = [
  ["问诊与症状", [
    ["chief complaint", "主诉", "The main symptom or concern that brings a patient to medical care."],
    ["history of present illness", "现病史", "An account of how the current complaint began, changed, and affected the patient."],
    ["past medical history", "既往史", "Relevant previous illnesses, treatments, and medical events."],
    ["review of systems", "系统回顾", "A structured inquiry about symptoms across major organ systems."],
    ["dyspnea", "呼吸困难", "The subjective sensation of difficult or uncomfortable breathing."],
    ["orthopnea", "端坐呼吸", "Breathlessness when lying flat that improves with sitting or standing."],
    ["palpitations", "心悸", "An unpleasant or unusually noticeable awareness of the heartbeat."],
    ["syncope", "晕厥", "A brief loss of consciousness from reduced cerebral blood flow, followed by spontaneous recovery."]
  ]],
  ["查体与体征", [
    ["inspection", "视诊", "Clinical examination by observing the patient or the affected area."],
    ["palpation", "触诊", "Clinical examination by feeling a body part with the hands or fingers."],
    ["percussion", "叩诊", "Clinical examination by tapping a body surface and assessing the resulting sound."],
    ["auscultation", "听诊", "Listening to sounds produced within the body, usually with a stethoscope."],
    ["pitting edema", "凹陷性水肿", "Swelling that leaves a temporary indentation after pressure is applied."],
    ["rebound tenderness", "反跳痛", "Tenderness elicited when pressure on the abdomen is released."],
    ["pallor", "苍白", "An unusually pale appearance of the skin or mucous membranes."],
    ["jaundice", "黄疸", "Yellow discoloration of the skin, sclerae, or other tissues caused by bilirubin accumulation."]
  ]],
  ["常用检验", [
    ["complete blood count", "全血细胞计数（血常规）", "A blood test that measures blood cell counts and related indices such as hemoglobin."],
    ["white blood cell differential", "白细胞分类计数", "A measurement of the proportions or numbers of the different white blood cell types."],
    ["urinalysis", "尿液分析", "An examination of urine using physical, chemical, and sometimes microscopic tests."],
    ["blood culture", "血培养", "A test that attempts to grow organisms from a blood sample."],
    ["arterial blood gas analysis", "动脉血气分析", "Testing of arterial blood to assess oxygenation, carbon dioxide, and acid–base status."],
    ["serum creatinine", "血清肌酐", "The concentration of creatinine in serum, commonly used to help assess kidney function."],
    ["coagulation profile", "凝血功能检查", "A panel of laboratory tests that assess aspects of blood clotting."],
    ["glycated hemoglobin", "糖化血红蛋白（HbA1c）", "Hemoglobin with glucose attached, measured to estimate average blood glucose over recent months."]
  ]],
  ["影像与操作", [
    ["chest radiograph", "胸部X线片", "An X-ray image of the chest that shows the lungs, heart, and surrounding structures."],
    ["computed tomography", "计算机断层扫描（CT）", "Imaging that uses multiple X-ray measurements to create cross-sectional images."],
    ["magnetic resonance imaging", "磁共振成像（MRI）", "Imaging that uses a magnetic field and radio waves to create detailed images of the body."],
    ["ultrasonography", "超声检查", "Imaging that uses high-frequency sound waves to depict internal structures."],
    ["electrocardiogram", "心电图（ECG）", "A recording of the electrical activity of the heart."],
    ["endoscopy", "内镜检查", "Examination of the inside of an organ or cavity using an instrument with a viewing system."],
    ["biopsy", "活组织检查（活检）", "Collection of cells or tissue for examination to help establish a diagnosis."],
    ["venipuncture", "静脉穿刺", "Entering a vein with a needle, usually to collect a blood sample."]
  ]],
  ["成人内科", [
    ["myocardial infarction", "心肌梗死", "Death of heart muscle tissue caused by prolonged ischemia."],
    ["atrial fibrillation", "心房颤动", "An arrhythmia characterized by disorganized electrical activity in the atria."],
    ["deep vein thrombosis", "深静脉血栓形成", "Formation of a blood clot within a deep vein, most often in the leg."],
    ["ischemic stroke", "缺血性脑卒中", "Brain injury caused by inadequate blood flow to part of the brain."],
    ["chronic obstructive pulmonary disease", "慢性阻塞性肺疾病（COPD）", "A chronic lung disease characterized by persistent airflow obstruction."],
    ["type 2 diabetes mellitus", "2型糖尿病", "A disorder of glucose regulation involving insulin resistance and insufficient insulin secretion for the body's needs."],
    ["cirrhosis", "肝硬化", "Advanced scarring and structural distortion of the liver."],
    ["osteoporosis", "骨质疏松症", "A skeletal disorder in which reduced bone strength increases fracture risk."]
  ]],
  ["诊疗与用药", [
    ["differential diagnosis", "鉴别诊断", "The process of considering and distinguishing the possible causes of a clinical presentation."],
    ["contraindication", "禁忌证", "A condition or circumstance that makes a treatment, test, or procedure unsuitable."],
    ["adverse drug reaction", "药品不良反应", "A harmful and unintended response attributed to a medication."],
    ["drug interaction", "药物相互作用", "A change in a drug's effects caused by another medication or substance."],
    ["informed consent", "知情同意", "Voluntary agreement after receiving and understanding relevant information about an intervention."],
    ["medication reconciliation", "用药核对", "Checking and resolving discrepancies in a patient's medication list, especially when care settings change."],
    ["prognosis", "预后", "The expected course or outcome of a disease or condition."],
    ["discharge summary", "出院小结", "A document summarizing a hospital stay, discharge plans, and follow-up needs."]
  ]]
].flatMap(([category, entries]) => entries.map(([term, chinese, definition]) => ({
  category: `通用 · ${category}`, term, chinese, definition
})));
