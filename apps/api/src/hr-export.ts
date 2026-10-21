import { BadRequestException, Controller, ForbiddenException, Get, Inject, Injectable, NotFoundException, Param, ParseUUIDPipe, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { deflateRawSync } from "node:zlib";
import sharp from "sharp";
import { fieldVisible, isDisplayField, parseTable, type FormField } from "@nolt/form-schemas";
import { Database } from "./database.js";
import { FilesService } from "./files.js";
import { SessionGuard, type AuthRequest } from "./auth.js";
import { axaWorkbook, hasAxaFields } from "./axa-sheet.js";
import { appOrigin } from "./security.js";
import { createFileShareToken } from "./shared-files.js";

type Image = { data: Buffer; width: number; height: number; name: string };
const safe = (v: string) => v.replace(/[^\w .-]+/g, "_").slice(0, 90).trim() || "document";
const formattedDate = (d: Date) => new Intl.DateTimeFormat("en-GB", {dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(d) + " UTC";
const ascii = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
const escapePdf = (v: string) => ascii(v).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
import { zipFiles } from "./zip.js";
export { zipFiles };
class PdfDocument {
  private pages: { lines: string[]; images: Image[]; links: {url:string; y:number}[]; y: number }[] = [];
  private page = this.next();
  private next() {
    const page = { lines: [] as string[], images: [] as Image[], links: [] as {url:string; y:number}[], y: 775 };
    this.pages.push(page); return page;
  }
  private ensure(space: number) { if (this.page.y - space < 65) this.page = this.next(); }
  text(value: unknown, size = 11, bold = false, gap = 8) {
    const content = ascii(value);
    const max = Math.max(22, Math.floor(94 * 11 / size));
    const words = content.split(/\s+/); let line = "";
    const emit = (v: string) => {
      this.ensure(size + gap);
      this.page.lines.push(`BT /F${bold ? 2 : 1} ${size} Tf 48 ${this.page.y} Td (${escapePdf(v)}) Tj ET`);
      this.page.y -= size + gap;
    };
    for (let word of words) {
      while (word.length > max) { if (line) { emit(line); line = ""; } emit(word.slice(0, max)); word = word.slice(max); }
      if ((line + " " + word).trim().length > max) { emit(line); line = word; } else line = (line + " " + word).trim();
    }
    if (line) emit(line); if (!words.length) emit("");
  }
  section(title: string) {
    this.ensure(45);
    this.page.y -= 7;
    this.page.lines.push(`0.91 0.95 0.99 rg 43 ${(this.page.y-23).toFixed(1)} 509 29 re f 0.05 0.19 0.39 rg`);
    this.page.lines.push(`BT /F2 12 Tf 52 ${(this.page.y-14).toFixed(1)} Td (${escapePdf(title)}) Tj ET 0 0 0 rg`);
    this.page.y -= 41;
  }
  field(label: string, value: unknown) {
    this.text(label, 9, true, 5);
    this.text(value, 11, false, 13);
  }
  link(label: string, url: string) {
    this.ensure(26);
    const y=this.page.y;
    this.page.lines.push(`0.04 0.34 0.72 rg BT /F2 10 Tf 48 ${y.toFixed(1)} Td (${escapePdf(label)}) Tj ET 0 0 0 rg`);
    this.page.links.push({url,y});
    this.page.y -= 22;
  }
  image(bytes: Buffer, dimensions: {width:number;height:number}, label: string) {
    // Preserve the photo or signature aspect ratio instead of stretching it.
    const scale = Math.min(1, 250 / dimensions.width, 215 / dimensions.height);
    const width = dimensions.width * scale, height = dimensions.height * scale;
    this.ensure(height + 28);
    const name = `Im${this.page.images.length+1}`;
    this.page.images.push({data:bytes,width:dimensions.width,height:dimensions.height,name});
    this.page.lines.push(`q ${width.toFixed(1)} 0 0 ${height.toFixed(1)} 48 ${(this.page.y-height).toFixed(1)} cm /${name} Do Q`);
    this.page.y -= height + 10; this.text(label, 9);
  }
  build() {
    type Obj = Buffer;
    const objects: Obj[] = [Buffer.alloc(0)];
    const put = (value: Buffer | string) => { objects.push(typeof value === "string" ? Buffer.from(value, "latin1") : value); return objects.length - 1; };
    const font1 = put("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const font2 = put("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pagesId = put("");
    const pageIds: number[] = [];
    for (const [index, page] of this.pages.entries()) {
      page.lines.unshift(`0.04 0.15 0.33 rg 0 811 595 31 re f 1 1 1 rg BT /F2 14 Tf 48 821 Td (NOLT HR) Tj ET 0 0 0 rg`);
      page.lines.push(`0.45 0.49 0.57 rg BT /F1 8 Tf 48 35 Td (NOLT HR  |  Confidential  |  Page ${index+1} of ${this.pages.length}) Tj ET 0 0 0 rg`);
      const imRefs: string[] = [];
      for (const img of page.images) {
        const header = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`);
        const id = put(Buffer.concat([header,img.data,Buffer.from("\nendstream")]));
        imRefs.push(`/${img.name} ${id} 0 R`);
      }
      const commands = Buffer.from(page.lines.join("\n"), "latin1");
      const contentId = put(Buffer.concat([Buffer.from(`<< /Length ${commands.length} >>\nstream\n`),commands,Buffer.from("\nendstream")]));
      const annotationRefs = page.links.map(link => put(
        `<< /Type /Annot /Subtype /Link /Rect [45 ${(link.y-5).toFixed(1)} 550 ${(link.y+12).toFixed(1)}] /Border [0 0 0] /A << /S /URI /URI (${escapePdf(link.url)}) >> >>`
      ));
      pageIds.push(put(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << ${imRefs.join(" ")} >> >> /Contents ${contentId} 0 R /Annots [${annotationRefs.map(id=>id+" 0 R").join(" ")}] >>`));
    }
    objects[pagesId] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id=>id+" 0 R").join(" ")}] /Count ${pageIds.length} >>`);
    const catalog = put(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")]; const offsets=[0]; let offset=chunks[0].length;
    for(let i=1;i<objects.length;i++) { offsets[i]=offset; const b=Buffer.concat([Buffer.from(`${i} 0 obj\n`),objects[i],Buffer.from("\nendobj\n")]);chunks.push(b); offset+=b.length; }
    const xref = offset;
    chunks.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(v=>String(v).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`));
    return Buffer.concat(chunks);
  }
}

@Injectable()
export class HrExportService {
  constructor(@Inject(Database) private db: Database, @Inject(FilesService) private files: FilesService) {}
  private async form(userId: string, assignmentId: string) {
    const assignment = await this.db.formAssignment.findUnique({
      where: {id:assignmentId}, include: { formVersion: true, onboardingCase: {include:{employee:true}},
        response: true, submissions: {orderBy:{version:"desc"},take:1,include:{review:{include:{reviewer:{select:{name:true}}}}}} },
    });
    if (!assignment || assignment.formVersion.recipient !== "EMPLOYEE" || !assignment.submissions.length)
      throw new NotFoundException("Completed employee submission not found.");
    const user=await this.db.user.findUnique({where:{id:userId}});
    if (!user?.active || user.role !== "HR") throw new ForbiddenException("Active HR access required.");
    return assignment;
  }
  async render(userId:string, assignmentId:string) {
    const a = await this.form(userId, assignmentId);
    const submission = a.submissions[0];
    const answers = submission.answers as Record<string, unknown>;
    const fields = a.formVersion.fields as unknown;
    if (!Array.isArray(fields)) throw new BadRequestException("Invalid form definition.");
    const doc = new PdfDocument();
    const supporting: { name:string; bytes:Buffer }[] = [];

    doc.text(a.formVersion.title, 18, true, 13);
    doc.text("Completed employee form  |  NOLT HR", 10, false, 14);
    doc.section("Employee information");
    doc.field("Employee", a.onboardingCase.employee.fullName);
    doc.field("Employee email", a.onboardingCase.employee.email);
    doc.field("Submitted", formattedDate(submission.submittedAt));
    doc.field("Form version", `Version ${a.formVersion.version}  |  Submission ${submission.version}`);

    doc.section("HR review");
    const decision = submission.review?.decision ?? "AWAITING REVIEW";
    doc.field("Status", decision.replaceAll("_", " "));
    if (submission.review) {
      doc.field("Reviewed by", submission.review.reviewer.name || "HR reviewer");
      doc.field("Review date", formattedDate(submission.review.reviewedAt));
      if (submission.review.reason) doc.field("Review comments", submission.review.reason);
    }

    doc.section("Submitted answers");
    const storedFiles = await this.db.storedFile.findMany({
      where: { assignmentId, status:"CONFIRMED", scanStatus:"CLEAN" },
      include: { signature: {select:{id:true, signedAt:true}} },
    });
    const filesToLoad = new Map<string, typeof storedFiles[number]>();
    for (const item of fields) {
      if (!item || typeof item !== "object") continue;
      const field = item as {id?:string;type?:string};
      const raw = field.id ? answers[field.id] : undefined;
      if (typeof raw !== "string" || !["file","passport_photo","signature"].includes(field.type ?? "")) continue;
      const file = storedFiles.find(row => row.fieldId === field.id &&
        (row.id === raw || row.signature?.id === raw));
      if (file) filesToLoad.set(file.id, file);
    }
    // Load private evidence concurrently, in small bounded groups to avoid
    // waiting serially on Supabase without exhausting storage connections.
    const evidence = new Map<string, Awaited<ReturnType<FilesService["downloadFile"]>>>();
    const requested = [...filesToLoad.values()];
    for (let i=0;i<requested.length;i+=3) {
      const chunk = requested.slice(i,i+3);
      const results = await Promise.all(chunk.map(file => this.files.downloadFile(userId,file.id)));
      results.forEach((result,index) => evidence.set(chunk[index].id,result));
    }

    for (const value of fields) {
      if (!value || typeof value !== "object") continue;
      const field = value as {id?:string;label?:string;type?:string;body?:string;showIf?:FormField["showIf"]};
      if (!field.id) continue;
      const label = field.label?.trim() || "Form field";
      // Wording blocks print as written, so the PDF copy reads like the paper form.
      if (field.type && isDisplayField(field.type)) {
        if (field.type === "heading") doc.section(label);
        else { if (label) doc.text(label, 10, true, 6); if (field.body) doc.text(field.body, 9, false, 8); }
        continue;
      }
      // A follow-up question that was not shown to the employee is not part of the copy.
      if (field.showIf && !fieldVisible(field as FormField, answers as Record<string, string | boolean | null>)) continue;
      const raw = answers[field.id];
      if (raw === null || raw === undefined || raw === "") {
        doc.field(label, "Not provided");
        continue;
      }
      if (field.type === "table") {
        const rows = parseTable(raw, field as FormField);
        const used = rows === "invalid" ? [] : rows.filter((r) => r.some((c, i) => c.trim() && !((field as FormField).fixedRows.length && i === 0)));
        doc.text(label, 10, true, 6);
        if (!used.length) { doc.text("Not provided", 10, false, 8); continue; }
        const columns = (field as FormField).columns;
        used.forEach((r, n) => {
          doc.text(`${n + 1}. ` + columns.map((c, i) => `${c.label}: ${r[i]?.trim() || "-"}`).join("  |  "), 10, false, 6);
        });
        continue;
      }
      if (["file", "passport_photo", "signature"].includes(field.type ?? "")) {
        const file = typeof raw === "string" ?
          storedFiles.find(row => row.fieldId === field.id &&
            (row.id === raw || row.signature?.id === raw)) : undefined;
        const uploaded = file ? evidence.get(file.id) : undefined;
        if (!uploaded || !file) {
          doc.field(label, "File was not available for this submitted field");
          continue;
        }
        doc.text(label, 10, true, 9);
        if (field.type === "file") {
          const filename = safe(uploaded.fileName);
          supporting.push({name:`Supporting_Documents/${safe(a.formVersion.title)}/${String(supporting.length+1).padStart(2,"0")}_${filename}`,bytes:uploaded.buffer});
          doc.text(`Attachment: ${filename}`, 10, false, 6);
          const token = createFileShareToken(file.id, file.sha256);
          doc.link("Open attached document", `${appOrigin()}/api/v1/shared-files/${file.id}?token=${token}`);
        } else if (uploaded.mimeType.startsWith("image/")) {
          const image = await sharp(uploaded.buffer).rotate().flatten({background:"#ffffff"}).jpeg({quality:85}).toBuffer({resolveWithObject:true});
          doc.image(image.data,{width:image.info.width,height:image.info.height},
            field.type === "signature" ? "Employee signature" : "Uploaded photograph");
          if (field.type === "signature" && file.signature?.signedAt) {
            doc.text(`Signed: ${formattedDate(file.signature.signedAt)}`,9);
          }
        } else {
          doc.text("The submitted image could not be displayed.",10);
        }
      } else {
        const answer = typeof raw === "boolean" ? (raw ? "Yes" : "No") :
          typeof raw === "string" ? raw : JSON.stringify(raw);
        doc.field(label,answer);
      }
    }
    doc.text("This report contains the employee's saved form responses and HR review outcome.",8);
    return {pdf:doc.build(),attachments:supporting,
      employee:safe(a.onboardingCase.employee.fullName),title:safe(a.formVersion.title),
      version:submission.version,review:decision};
  }
  /** AXA Mansard enrolment spreadsheet built from approved AXA enrolment forms. */
  async axaEnrolment(userId:string) {
    const user=await this.db.user.findUnique({where:{id:userId}});
    if(!user?.active || user.role!=="HR") throw new ForbiddenException("Active HR access required.");
    const versions=await this.db.formVersion.findMany({
      where:{status:{in:["PUBLISHED","UNPUBLISHED"]}}, select:{id:true,fields:true}, take:500,
    });
    const axaVersions=versions.filter(v=>hasAxaFields(v.fields));
    if(!axaVersions.length) throw new NotFoundException("No AXA enrolment form has been published yet.");
    const assignments=await this.db.formAssignment.findMany({
      where:{formVersionId:{in:axaVersions.map(v=>v.id)},submissions:{some:{}}},
      orderBy:{createdAt:"asc"},
      include:{formVersion:{select:{fields:true}},submissions:{orderBy:{version:"desc"},take:1,include:{review:true}}},
    });
    const approved=assignments.filter(a=>a.submissions[0]?.review?.decision==="APPROVED");
    if(!approved.length) throw new NotFoundException("No approved AXA enrolment forms to export yet. Approve the employee's form first.");
    const buffer=axaWorkbook(approved.map(a=>({
      fields:a.formVersion.fields as never,
      answers:a.submissions[0].answers as Record<string,string|boolean|null>,
    })));
    return {buffer,count:approved.length};
  }
  async recordDownload(actorId:string, targetId:string, action:string) {
    await this.db.auditEvent.create({data:{actorId,targetId,action,metadata:{exportedAt:new Date().toISOString()}}});
  }
  async caseArchive(userId:string, caseId:string) {
    const user = await this.db.user.findUnique({where:{id:userId},select:{active:true,role:true}});
    if (!user?.active || user.role !== "HR") throw new ForbiddenException("Active HR access required.");
    const onboarding = await this.db.onboardingCase.findUnique({
      where:{id:caseId},
      include:{
        employee:true,
        assignments:{
          where:{formVersion:{recipient:"EMPLOYEE"},submissions:{some:{}}},
          orderBy:{createdAt:"asc"},
          include:{formVersion:{select:{title:true}}},
        },
      },
    });
    if (!onboarding) throw new NotFoundException("Employee onboarding case not found.");
    if (!onboarding.assignments.length)
      throw new BadRequestException("This employee has not submitted any forms yet.");
    const root = `${safe(onboarding.employee.fullName)}_Completed_Forms`;
    const entries:{name:string;bytes:Buffer}[]=[];
    const info=new PdfDocument();
    info.text("Employee completed forms",18,true,12);
    info.section("Onboarding summary");
    info.field("Employee",onboarding.employee.fullName);
    info.field("Exported",formattedDate(new Date()));
    info.field("Completed form submissions",onboarding.assignments.length);
    for(const [index,assignment] of onboarding.assignments.entries()) {
      const rendered = await this.render(userId,assignment.id);
      const prefix = String(index+1).padStart(2,"0");
      entries.push({name:`${root}/${prefix}_${rendered.title}.pdf`,bytes:rendered.pdf});
      for(const attachment of rendered.attachments) {
        entries.push({name:`${root}/Supporting_Documents/${prefix}_${rendered.title}/${attachment.name.split("/").pop()}`,bytes:attachment.bytes});
      }
      info.text(`${prefix}. ${assignment.formVersion.title} - ${rendered.review.replaceAll("_"," ")}`,11);
    }
    entries.unshift({name:`${root}/00_Completed_Forms_Summary.pdf`,bytes:info.build()});
    if(entries.length>160 || entries.reduce((n,e)=>n+e.bytes.length,0)>100*1024*1024)
      throw new BadRequestException("Export is too large. Download the forms individually.");
    return {buffer:zipFiles(entries),filename:`${root}.zip`};
  }
  async pack(userId:string, packAssignmentId:string) {
    const user=await this.db.user.findUnique({where:{id:userId}});
    if(!user?.active || user.role!=="HR") throw new ForbiddenException("Active HR access required.");
    const pack = await this.db.packAssignment.findUnique({
      where: { id: packAssignmentId },
      include: {
        pack: true,
        onboardingCase: { include: { employee: true } },
        forms: {
          orderBy: { position: "asc" },
          include: {
            formAssignment: {
              include: { formVersion: { select: { title: true } } },
            },
          },
        },
      },
    });
    if(!pack) throw new NotFoundException("Assigned pack not found.");
    const employee=safe(pack.onboardingCase.employee.fullName);
    const root=`${employee}_${safe(pack.pack.name)}`;
    const entries:{name:string;bytes:Buffer}[]=[];const summary:string[]=[
      "NOLT HR - ONBOARDING PACK EXPORT",`Employee: ${pack.onboardingCase.employee.fullName}`,`Pack: ${pack.pack.name}`,`Exported: ${new Date().toISOString()}`, "Forms:"];
    for(const [index,part] of pack.forms.entries()) {
      try {
        const form=await this.render(userId,part.formAssignmentId);
        const prefix=String(index+1).padStart(2,"0");
        entries.push({name:`${root}/${prefix}_${form.title}.pdf`,bytes:form.pdf});
        for(const item of form.attachments) entries.push({name:`${root}/Supporting_Documents/${prefix}_${form.title}/${item.name.split("/").pop()}`,bytes:item.bytes});
        summary.push(`${prefix}. ${form.title} | Submission v${form.version} | ${form.review}`);
      } catch (error) {
        if(!(error instanceof NotFoundException)) throw error;
        summary.push(`${index+1}. ${part.formAssignment.formVersion.title} | Not yet submitted`);
      }
    }
    const info=new PdfDocument();info.section("Onboarding pack summary");for(const line of summary) info.text(line,11);
    entries.unshift({name:`${root}/00_Pack_Summary.pdf`,bytes:info.build()});
    if(entries.length>160)throw new BadRequestException("Pack contains too many attachments to export.");
    if(entries.reduce((n,entry)=>n+entry.bytes.length,0)>100*1024*1024)
      throw new BadRequestException("Pack export exceeds the 100MB safety limit. Download individual forms instead.");
    return {buffer:zipFiles(entries),filename:`${root}.zip`};
  }
}
@ApiTags("HR PDF and pack exports")
@UseGuards(SessionGuard)
@Controller("exports")
export class HrExportController {
  constructor(@Inject(HrExportService) private readonly exports:HrExportService){}
  @Get("forms/:id.pdf")
  async form(@Req() req:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Res() res:Response) {
    const doc=await this.exports.render(req.actor.id,id);
    await this.exports.recordDownload(req.actor.id, id, "FORM_PDF_EXPORTED");
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${doc.employee}_${doc.title}.pdf"`);
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    res.send(doc.pdf);
  }
  @Get("axa-enrolment.xlsx")
  async axaEnrolment(@Req() req:AuthRequest,@Res() res:Response) {
    const sheet=await this.exports.axaEnrolment(req.actor.id);
    await this.exports.recordDownload(req.actor.id, req.actor.id, "AXA_ENROLMENT_EXPORTED");
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="AXA_HMO_Enrolment_${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.setHeader("X-Row-Count",String(sheet.count));
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    res.send(sheet.buffer);
  }
  @Get("cases/:id.zip")
  async caseArchive(@Req() req:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Res() res:Response) {
    const archive=await this.exports.caseArchive(req.actor.id,id);
    await this.exports.recordDownload(req.actor.id,id,"CASE_FORMS_ZIP_EXPORTED");
    res.setHeader("Content-Type","application/zip");
    res.setHeader("Content-Disposition",`attachment; filename="${archive.filename}"`);
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    res.send(archive.buffer);
  }
  @Get("packs/:id.zip")
  async pack(@Req() req:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Res() res:Response) {
    const archive=await this.exports.pack(req.actor.id,id);
    await this.exports.recordDownload(req.actor.id, id, "PACK_ZIP_EXPORTED");
    res.setHeader("Content-Type","application/zip");
    res.setHeader("Content-Disposition",`attachment; filename="${archive.filename}"`);
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    res.send(archive.buffer);
  }
}
